// yo → js — the "yo" toy language, as a SCRIPT NODE.
//
// yo is a tiny async-first language; its keywords are @-mentions:
//   name = expr            bind a variable
//   @a -> expr | { … }     async function  (calling it yields a pending value)
//   @f -> expr | { … }     sync  function  (calling it yields the value directly)
//   @w expr                wait/await the pending value an @a call produced
//   @r expr                return out of a function
//   @l(expr)               builtin: print
//   numbers, + - * /, ( )
//
// STRATEGY: don't interpret — COMPILE. The old experiments/js-engine/yo.js walked the AST
// and evaluated it; here the SAME lexer + parser feed a code generator that emits plain
// JavaScript, which the browser then runs. The mapping is almost 1:1 because yo's @a / @f /
// @w ARE JS's async fn / plain fn / await. Edit the source → Compile to see the emitted JS
// → Run to execute it. This is "a note that is a program" — the compiler lives in the tree.
export default (x) => {
  /* ── 1. LEXER  (source text → tokens) ── */
  const tokenize = (src) => {
    const tokens = []
    let i = 0
    const isDigit = (char) => char >= '0' && char <= '9'
    const isAlpha = (char) =>
      (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_'
    const isAlnum = (char) => isAlpha(char) || isDigit(char)

    while (i < src.length) {
      const char = src[i]
      if (char === '\n') {
        tokens.push({ type: 'NEWLINE' })
        i++
        continue
      }
      if (char === ' ' || char === '\t' || char === '\r') {
        i++
        continue
      }
      if (char === '-' && src[i + 1] === '>') {
        tokens.push({ type: 'ARROW' })
        i += 2
        continue
      }
      if (char === '@') {
        let j = i + 1
        while (j < src.length && isAlnum(src[j])) {
          j++
        }
        const name = src.slice(i + 1, j)
        if (name.length === 0) {
          throw new SyntaxError(`'@' must be followed by a name at position ${i}`)
        }
        tokens.push({ type: 'AT', name })
        i = j
        continue
      }
      if (isAlpha(char)) {
        let j = i
        while (j < src.length && isAlnum(src[j])) {
          j++
        }
        tokens.push({ type: 'IDENT', name: src.slice(i, j) })
        i = j
        continue
      }
      if (isDigit(char)) {
        let j = i
        while (j < src.length && (isDigit(src[j]) || src[j] === '.')) {
          j++
        }
        tokens.push({ type: 'NUMBER', value: Number(src.slice(i, j)) })
        i = j
        continue
      }
      const single = {
        '=': 'EQUALS',
        '+': 'PLUS',
        '-': 'MINUS',
        '*': 'STAR',
        '/': 'SLASH',
        '(': 'LPAREN',
        ')': 'RPAREN',
        ',': 'COMMA',
        '{': 'LBRACE',
        '}': 'RBRACE',
      }
      if (single[char]) {
        tokens.push({ type: single[char] })
        i++
        continue
      }
      throw new SyntaxError(`Unexpected character '${char}' at position ${i}`)
    }
    tokens.push({ type: 'EOF' })
    return tokens
  }

  /* ── 2. PARSER  (tokens → AST), recursive descent ── */
  const parse = (tokens) => {
    let pos = 0
    const peek = (offset = 0) => tokens[pos + offset] ?? tokens[tokens.length - 1]
    const next = () => tokens[pos++]
    const expect = (type) => {
      const token = next()
      if (token.type !== type) {
        throw new SyntaxError(`Expected ${type} but got ${token.type}`)
      }
      return token
    }
    const skipNewlines = () => {
      while (peek().type === 'NEWLINE') {
        next()
      }
    }
    const parseStatementList = (endType) => {
      const body = []
      skipNewlines()
      while (peek().type !== endType) {
        if (peek().type === 'EOF') {
          throw new SyntaxError(`Unexpected EOF: expected ${endType}`)
        }
        body.push(parseStatement())
        if (peek().type === 'NEWLINE') {
          skipNewlines()
        } else if (peek().type !== endType) {
          throw new SyntaxError(`Expected end of statement but got ${peek().type}`)
        }
      }
      return body
    }
    const parseBlock = () => {
      expect('LBRACE')
      const body = parseStatementList('RBRACE')
      expect('RBRACE')
      return { type: 'Block', body }
    }
    const parseStatement = () => {
      if (peek().type === 'AT' && peek().name === 'r') {
        next()
        const tokenType = peek().type
        const hasValue = tokenType !== 'NEWLINE' && tokenType !== 'RBRACE' && tokenType !== 'EOF'
        return { type: 'Return', value: hasValue ? parseExpression() : null }
      }
      if (peek().type === 'IDENT' && peek(1).type === 'EQUALS') {
        const name = next().name
        expect('EQUALS')
        return { type: 'Assign', name, value: parseExpression() }
      }
      return { type: 'ExprStmt', expr: parseExpression() }
    }
    const parseExpression = () => {
      if (peek().type === 'AT' && (peek().name === 'a' || peek().name === 'f')) {
        return parseFn()
      }
      return parseAdditive()
    }
    const parseFn = () => {
      const at = next() // AT 'a' (async) or 'f' (sync)
      const isAsync = at.name === 'a'
      expect('ARROW')
      const body = peek().type === 'LBRACE' ? parseBlock() : parseExpression()
      return { type: 'Fn', async: isAsync, body }
    }
    const parseAdditive = () => {
      let node = parseMultiplicative()
      while (peek().type === 'PLUS' || peek().type === 'MINUS') {
        const op = next().type === 'PLUS' ? '+' : '-'
        node = { type: 'BinaryOp', op, left: node, right: parseMultiplicative() }
      }
      return node
    }
    const parseMultiplicative = () => {
      let node = parseUnary()
      while (peek().type === 'STAR' || peek().type === 'SLASH') {
        const op = next().type === 'STAR' ? '*' : '/'
        node = { type: 'BinaryOp', op, left: node, right: parseUnary() }
      }
      return node
    }
    const parseUnary = () => {
      if (peek().type === 'AT' && peek().name === 'w') {
        next()
        return { type: 'Await', expr: parseUnary() }
      }
      return parseCall()
    }
    const parseCall = () => {
      let node = parsePrimary()
      while (peek().type === 'LPAREN') {
        next()
        const args = []
        if (peek().type !== 'RPAREN') {
          args.push(parseExpression())
          while (peek().type === 'COMMA') {
            next()
            args.push(parseExpression())
          }
        }
        expect('RPAREN')
        node = { type: 'Call', callee: node, args }
      }
      return node
    }
    const parsePrimary = () => {
      const token = peek()
      if (token.type === 'NUMBER') {
        next()
        return { type: 'Number', value: token.value }
      }
      if (token.type === 'IDENT') {
        next()
        return { type: 'Var', name: token.name }
      }
      if (token.type === 'AT') {
        if (token.name === 'a' || token.name === 'f') {
          return parseFn()
        }
        next()
        return { type: 'Builtin', name: token.name }
      }
      if (token.type === 'LPAREN') {
        next()
        const expr = parseExpression()
        expect('RPAREN')
        return expr
      }
      throw new SyntaxError(`Unexpected token ${token.type}`)
    }
    return { type: 'Program', body: parseStatementList('EOF') }
  }

  /* ── 3. CODEGEN  (AST → JavaScript source) — the new strategy (was: evaluate) ──
     yo's async model is JS's async model, so the mapping is direct:
       @a -> …   →  async () => …      (call returns a Promise)
       @f -> …   →  () => …            (call returns the value)
       @w e      →  (await e)
       @r e      →  return e
       @l        →  log  (the print builtin, injected at run time)
     yo binds per-scope (set always writes the current scope), so each block tracks its own
     declared names: first binding → `let`, a re-binding in the same block → bare assign. */
  const compileToJs = (ast) => {
    const genExpr = (node) => {
      switch (node.type) {
        case 'Number':
          return String(node.value)
        case 'Var':
          return node.name
        case 'Builtin':
          return node.name === 'l' ? 'log' : node.name
        case 'BinaryOp':
          return `(${genExpr(node.left)} ${node.op} ${genExpr(node.right)})`
        case 'Await':
          return `(await ${genExpr(node.expr)})`
        case 'Call':
          return `${genExpr(node.callee)}(${node.args.map(genExpr).join(', ')})`
        case 'Fn': {
          const head = node.async ? 'async () => ' : '() => '
          const body =
            node.body.type === 'Block' ? genBlock(node.body.body, 1) : genExpr(node.body)
          return head + body
        }
        default:
          throw new Error(`cannot generate expression: ${node.type}`)
      }
    }
    const genStmt = (node, declared) => {
      switch (node.type) {
        case 'Assign': {
          const keyword = declared.has(node.name) ? '' : 'let '
          declared.add(node.name)
          return `${keyword}${node.name} = ${genExpr(node.value)}`
        }
        case 'Return':
          return node.value ? `return ${genExpr(node.value)}` : 'return'
        case 'ExprStmt':
          return genExpr(node.expr)
        default:
          throw new Error(`cannot generate statement: ${node.type}`)
      }
    }
    const genBlock = (body, depth) => {
      const declared = new Set() // a block is its own scope
      const pad = '  '.repeat(depth)
      const lines = body.map((stmt) => pad + genStmt(stmt, declared))
      return `{\n${lines.join('\n')}\n${'  '.repeat(depth - 1)}}`
    }
    const declared = new Set()
    return ast.body.map((stmt) => genStmt(stmt, declared)).join('\n')
  }

  const compile = (src) => compileToJs(parse(tokenize(src)))

  /* ── 4. UI  (source → Compile → JS → Run) ── */
  const SAMPLE = [
    'onePlusOne = @a -> {',
    '    sum = 1 + 1',
    '    @r sum',
    '}',
    '',
    'result = @w onePlusOne()',
    '@l(result)',
  ].join('\n')

  let source
  let output
  let panel

  const showJs = () => {
    try {
      output.textContent = compile(source.value)
      return true
    } catch (err) {
      output.textContent = `// compile error: ${err.message}`
      return false
    }
  }

  const run = async () => {
    panel.clear()
    if (!showJs()) {
      panel.push('compile failed — see the generated panel', 'sys')
      return
    }
    // @l prints through here; the builtin returns its first arg (like the old interpreter).
    const log = (...args) => {
      panel.push(args.map(String).join(' '), 'down')
      return args[0]
    }
    try {
      // Wrap the emitted top-level statements in an async IIFE so a top-level `@w` (→ await)
      // is valid; new Function keeps the generated code out of this module's scope.
      const program = new Function('log', `return (async () => {\n${output.textContent}\n})()`)
      await program(log)
      panel.push('done ✓', 'sys')
    } catch (err) {
      panel.push(`runtime error: ${err.message}`, 'sys')
    }
  }

  const monospace = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '13px',
    lineHeight: '1.5',
  }

  x.ui.row((row) => {
    row.button('Compile → JS', showJs)
    row.button('Run ▶', run)
    row.button('Reset', () => {
      source.value = SAMPLE
      output.textContent = '// generated JS appears here'
    })
  })

  const sourceRow = x.ui.row()
  sourceRow.style.display = 'block'
  source = document.createElement('textarea')
  source.value = SAMPLE
  source.spellcheck = false
  Object.assign(source.style, {
    width: '100%',
    height: '150px',
    boxSizing: 'border-box',
    padding: '8px',
    border: '1px solid #d0d7de',
    borderRadius: '6px',
    resize: 'vertical',
    ...monospace,
  })
  sourceRow.appendChild(source)

  const outputRow = x.ui.row()
  outputRow.style.display = 'block'
  output = document.createElement('pre')
  output.textContent = '// generated JS appears here'
  Object.assign(output.style, {
    width: '100%',
    boxSizing: 'border-box',
    margin: '0',
    padding: '8px',
    background: '#f6f8fa',
    border: '1px solid #d0d7de',
    borderRadius: '6px',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    ...monospace,
  })
  outputRow.appendChild(output)

  panel = x.ui.log({ height: '140px' })

  // Auto-show the generated JS on open (runOnOpen) so the node is self-explanatory.
  showJs()
}
