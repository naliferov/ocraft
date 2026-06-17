// yo.js — the "yo" language interpreter.
// yo: a tiny, async-first toy language. Keywords are @-mentions ("yo, @log this").
// Run it:   node yo.js [path-to-program]   (defaults to program.yo)
//
// Pipeline:   source text -> tokens (lexer) -> AST (parser) -> value (evaluator)
//
// Language features:
//   name = expr            variable binding
//   @a -> expr / { ... }   async function — call yields a pending value (use @w to get it)
//   @f -> expr / { ... }   sync  function — call yields the value directly (no @w)
//   @w expr                wait/await — unwrap the pending value an @a call produced
//   @r expr                return a value out of a function
//   f()                    function call
//   @l(expr)               builtin that prints
//   numbers, + - * /, ( )  arithmetic

import fs from 'node:fs'

/* ─────────────────────────────── 1. LEXER ─────────────────────────────── */

function tokenize(src) {
  const tokens = []
  let i = 0
  const isDigit = (c) => c >= '0' && c <= '9'
  const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
  const isAlnum = (c) => isAlpha(c) || isDigit(c)

  while (i < src.length) {
    const c = src[i]

    // newline -> statement separator (kept as a token)
    if (c === '\n') {
      tokens.push({ type: 'NEWLINE' })
      i++
      continue
    }
    // other whitespace -> skip
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }

    // "->" arrow (check before the single '-' operator)
    if (c === '-' && src[i + 1] === '>') {
      tokens.push({ type: 'ARROW' })
      i += 2
      continue
    }

    // "@word" -> a keyword/builtin token (e.g. @a, @w, @r, @l)
    if (c === '@') {
      let j = i + 1
      while (j < src.length && isAlnum(src[j])) j++
      const name = src.slice(i + 1, j)
      if (name.length === 0)
        throw new SyntaxError(`'@' must be followed by a name at position ${i}`)
      tokens.push({ type: 'AT', name })
      i = j
      continue
    }

    // identifier
    if (isAlpha(c)) {
      let j = i
      while (j < src.length && isAlnum(src[j])) j++
      tokens.push({ type: 'IDENT', name: src.slice(i, j) })
      i = j
      continue
    }

    // number (integer or decimal)
    if (isDigit(c)) {
      let j = i
      while (j < src.length && (isDigit(src[j]) || src[j] === '.')) j++
      tokens.push({ type: 'NUMBER', value: Number(src.slice(i, j)) })
      i = j
      continue
    }

    // single-character tokens
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
    if (single[c]) {
      tokens.push({ type: single[c] })
      i++
      continue
    }

    throw new SyntaxError(`Unexpected character '${c}' at position ${i}`)
  }

  tokens.push({ type: 'EOF' })
  return tokens
}

/* ─────────────────────────────── 2. PARSER ──────────────────────────────
   Recursive descent. Grammar (low -> high precedence):

     program   := statement*
     statement := "@r" expression?              (return)
                | IDENT "=" expression           (assignment)
                | expression                     (expression statement)
     expression := function | additive
     function   := ("@a" | "@f") "->" (block | expression)
     block      := "{" statement* "}"
     additive   := multiplicative (("+"|"-") multiplicative)*
     multiplicative := unary (("*"|"/") unary)*
     unary      := "@w" unary | call
     call       := primary ("(" args? ")")*
     args       := expression ("," expression)*
     primary    := NUMBER | IDENT | function | "@name" (builtin) | "(" expression ")"
*/

function parse(tokens) {
  let pos = 0
  const peek = (k = 0) => tokens[pos + k] ?? tokens[tokens.length - 1]
  const next = () => tokens[pos++]
  const expect = (type) => {
    const t = next()
    if (t.type !== type) throw new SyntaxError(`Expected ${type} but got ${t.type}`)
    return t
  }
  const skipNewlines = () => {
    while (peek().type === 'NEWLINE') next()
  }

  // Parse statements until `endType` (EOF for the program, RBRACE for a block).
  function parseStatementList(endType) {
    const body = []
    skipNewlines()
    while (peek().type !== endType) {
      if (peek().type === 'EOF') throw new SyntaxError(`Unexpected EOF: expected ${endType}`)
      body.push(parseStatement())
      if (peek().type === 'NEWLINE') skipNewlines()
      else if (peek().type !== endType)
        throw new SyntaxError(`Expected end of statement but got ${peek().type}`)
    }
    return body
  }

  function parseProgram() {
    return { type: 'Program', body: parseStatementList('EOF') }
  }

  function parseBlock() {
    expect('LBRACE')
    const body = parseStatementList('RBRACE')
    expect('RBRACE')
    return { type: 'Block', body }
  }

  function parseStatement() {
    // return: "@r" expression?
    if (peek().type === 'AT' && peek().name === 'r') {
      next()
      const t = peek().type
      const hasValue = t !== 'NEWLINE' && t !== 'RBRACE' && t !== 'EOF'
      return { type: 'Return', value: hasValue ? parseExpression() : null }
    }
    // assignment: IDENT "=" expression
    if (peek().type === 'IDENT' && peek(1).type === 'EQUALS') {
      const name = next().name
      expect('EQUALS')
      return { type: 'Assign', name, value: parseExpression() }
    }
    return { type: 'ExprStmt', expr: parseExpression() }
  }

  function parseExpression() {
    if (peek().type === 'AT' && (peek().name === 'a' || peek().name === 'f')) return parseFn()
    return parseAdditive()
  }

  function parseFn() {
    const at = next() // AT 'a' (async) or 'f' (sync)
    const isAsync = at.name === 'a'
    expect('ARROW')
    const body = peek().type === 'LBRACE' ? parseBlock() : parseExpression()
    return { type: 'Fn', async: isAsync, body }
  }

  function parseAdditive() {
    let node = parseMultiplicative()
    while (peek().type === 'PLUS' || peek().type === 'MINUS') {
      const op = next().type === 'PLUS' ? '+' : '-'
      node = { type: 'BinaryOp', op, left: node, right: parseMultiplicative() }
    }
    return node
  }

  function parseMultiplicative() {
    let node = parseUnary()
    while (peek().type === 'STAR' || peek().type === 'SLASH') {
      const op = next().type === 'STAR' ? '*' : '/'
      node = { type: 'BinaryOp', op, left: node, right: parseUnary() }
    }
    return node
  }

  function parseUnary() {
    // "@w expr" — wait/await binds tighter than * and /, like JS await
    if (peek().type === 'AT' && peek().name === 'w') {
      next()
      return { type: 'Await', expr: parseUnary() }
    }
    return parseCall()
  }

  function parseCall() {
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

  function parsePrimary() {
    const t = peek()
    if (t.type === 'NUMBER') {
      next()
      return { type: 'Number', value: t.value }
    }
    if (t.type === 'IDENT') {
      next()
      return { type: 'Var', name: t.name }
    }
    if (t.type === 'AT') {
      if (t.name === 'a' || t.name === 'f') return parseFn()
      next()
      return { type: 'Builtin', name: t.name } // e.g. @l — a callable value
    }
    if (t.type === 'LPAREN') {
      next()
      const expr = parseExpression()
      expect('RPAREN')
      return expr
    }
    throw new SyntaxError(`Unexpected token ${t.type}`)
  }

  return parseProgram()
}

/* ────────────────────────────── 3. EVALUATOR ────────────────────────────
   `evaluate` is async so guest `@w` can suspend on real promises.

   - Calling a sync (@f) function returns its value directly (it auto-resolves at the
     call site). Calling an async (@a) function returns an `Async` wrapper that only
     `@w` unwraps — like forgetting `await` in JS leaves a Promise.
   - `@r` throws a `ReturnSignal` that unwinds out to the enclosing function call.
   - Each function call runs in a child `Scope`, so locals like `sum` stay local. */

class Scope {
  constructor(parent = null) {
    this.vars = new Map()
    this.parent = parent
  }
  has(name) {
    return this.vars.has(name) || (this.parent !== null && this.parent.has(name))
  }
  get(name) {
    if (this.vars.has(name)) return this.vars.get(name)
    if (this.parent !== null) return this.parent.get(name)
    throw new Error(`Undefined variable: ${name}`)
  }
  set(name, value) {
    this.vars.set(name, value)
  }
}

class Async {
  constructor(promise) {
    this.promise = promise
  }
}

class ReturnSignal {
  constructor(value) {
    this.value = value
  }
}

async function evaluate(node, env) {
  switch (node.type) {
    case 'Program':
    case 'Block': {
      let last
      for (const stmt of node.body) last = await evaluate(stmt, env)
      return last
    }

    case 'Assign': {
      const value = await evaluate(node.value, env)
      env.set(node.name, value)
      return value
    }

    case 'Return': {
      const value = node.value ? await evaluate(node.value, env) : undefined
      throw new ReturnSignal(value)
    }

    case 'ExprStmt':
      return await evaluate(node.expr, env)

    case 'Number':
      return node.value

    case 'Var':
      return env.get(node.name) // Scope.get throws if undefined

    case 'Builtin': {
      const key = '@' + node.name
      if (!env.has(key)) throw new Error(`Unknown keyword: @${node.name}`)
      return env.get(key)
    }

    case 'BinaryOp': {
      const left = await evaluate(node.left, env)
      const right = await evaluate(node.right, env)
      switch (node.op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return left / right
      }
      throw new Error(`Unknown operator: ${node.op}`)
    }

    case 'Fn':
      // A function literal. Calling runs the body in a child scope; @r unwinds here.
      // (Parameters are not supported yet; the body closes over the defining scope.)
      // Sync (@f): return the body promise -> it auto-resolves at the call site (no @w).
      // Async (@a): wrap it in Async so it stays pending until @w unwraps it.
      return (..._args) => {
        const result = (async () => {
          const local = new Scope(env)
          try {
            return await evaluate(node.body, local)
          } catch (e) {
            if (e instanceof ReturnSignal) return e.value
            throw e
          }
        })()
        return node.async ? new Async(result) : result
      }

    case 'Await': {
      const value = await evaluate(node.expr, env)
      if (value instanceof Async) return await value.promise
      return value // awaiting a plain value is a no-op, like JS `await 2`
    }

    case 'Call': {
      const callee = await evaluate(node.callee, env)
      const args = []
      for (const a of node.args) args.push(await evaluate(a, env))
      if (typeof callee !== 'function') throw new Error('Attempt to call a non-function')
      return callee(...args)
    }

    default:
      throw new Error(`Unknown node type: ${node.type}`)
  }
}

function makeGlobalScope() {
  const scope = new Scope()
  scope.set('@l', (...args) => {
    console.log(...args)
    return args[0]
  })
  return scope
}

/* ──────────────────────────────── 4. RUN ──────────────────────────────── */

async function main() {
  // Default program sits next to this script, so it resolves no matter the CWD.
  const file = process.argv[2] || new URL('program.yo', import.meta.url)
  const source = fs.readFileSync(file, 'utf8')

  const tokens = tokenize(source)
  const ast = parse(tokens)

  console.log('── source ──')
  console.log(source.trim())
  console.log('\n── tokens ──')
  console.log(
    tokens
      .map((t) => ((t.name ?? t.value) !== undefined ? `${t.type}(${t.name ?? t.value})` : t.type))
      .join(' '),
  )
  console.log('\n── ast ──')
  console.log(JSON.stringify(ast, null, 2))
  console.log('\n── output ──')

  await evaluate(ast, makeGlobalScope())
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
