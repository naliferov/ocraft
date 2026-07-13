# super-terse-code

The code sibling of [super-terse](/doc/super-terse). Where super-terse squeezes _prose_ to a telegraphic skeleton, super-terse-code squeezes _code_: replace each language keyword with a 1-char **sigil**, drop the boilerplate punctuation, keep the semantic structure. You trade legibility-at-a-glance for density — so it needs a **legend** (or a compiler) to read back.

We already have a working instance: **yolang** (run it in [/script/yo-to-js](/script/yo-to-js)). It doesn't interpret — it _compiles_ to plain JS, so the sigils map 1:1 onto real language constructs.

## yolang sigils

| yo          | JS               | meaning     |
| ----------- | ---------------- | ----------- |
| `name = e`  | `let name = e`   | bind        |
| `@a -> …`   | `async () => …`  | async fn    |
| `@f -> …`   | `() => …`        | sync fn     |
| `@w e`      | `await e`        | wait        |
| `@r e`      | `return e`       | return      |
| `@l(e)`     | `log(e)`         | print       |

Keywords become `@`-mentions; `=`, `+ - * /`, `( )`, `{ }` stay. The async model _is_ JS's async model (`@a`/`@w` → `async`/`await`), so nothing is faked.

## Worked example

yo:

```
onePlusOne = @a -> {
    sum = 1 + 1
    @r sum
}
result = @w onePlusOne()
@l(result)
```

compiles to JS:

```js
let onePlusOne = async () => {
  let sum = (1 + 1)
  return sum
}
let result = (await onePlusOne())
log(result)
```

## The principle

- **keyword → sigil** — `async`/`await`/`return`/`function` collapse to one glyph each.
- **drop ceremony** — no `function`, no `const`/`let` (binding is just `=`), no statement terminators.
- **keep structure** — expressions, blocks, call/args, and the async shape survive unchanged.

## Tradeoff

Dense and fast to _write_, slow to _read cold_ — the glyphs carry no mnemonic, so a newcomer needs the legend. Same bet as super-terse prose: worth it when the author re-reads often and the compiler (or a fixed legend) guarantees it round-trips. Not worth it for code others must read without the key.
