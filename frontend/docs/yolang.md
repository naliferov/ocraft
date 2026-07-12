# yolang (yo)

A tiny, async-first toy language. Keywords are `@` -mentions ("yo, @log this"). Pipeline: source → tokens (lexer) → AST (parser) → **JavaScript** (code generator). Lives in ocraft as the `yo-to-js` script node (id 200), which transpiles to JS and runs the emitted code — it no longer interprets the AST.

Current features:

-   `name = expr` — variable binding
-   `@a -> expr / { … }` — async function (call yields a pending value; `@w` to get it)
-   `@f -> expr / { … }` — sync function (call yields the value directly)
-   `@w expr` — wait/await
-   `@r expr` — return
-   `@l(expr)` — print builtin
-   numbers, `+ - * /` , `( )`

Intended direction (see ocraft `IDEAS.md` ): an embeddable, **sandboxed** scripting medium for nodes — capability-by-builtin, so a script can only do what its injected builtins expose.

## Future implementation ideas (merged from turboscript)

TurboScript is a TypeScript-like language that **compiles to WebAssembly** and has **native fixed-width integer types** ( `uint8` , `int8` , `uint16` , `int16` , `int32` , `float32` …) — the thing plain JS/TS lacks (everything is float64). That's the reference point for taking yo from "expressive interpreter" toward "typed/fast":

-   **Typed, bounded fixed-width integers** — give yo real numeric types with range validation, instead of JS doubles. Prototype of the idea in plain TS (a factory that mints validated integer classes):
    
    ```typescript
    function boundedInt(name: string, min: number, max: number) {
      return class {
        private constructor(public readonly value: number) {}
    
        static of(n: number): InstanceType<ReturnType<typeof boundedInt>> {
          if (!Number.isInteger(n)) throw new TypeError(`${name} must be an integer, got ${n}`)
          if (n < min || n > max)   throw new RangeError(`${name} out of range ${min}..${max}, got ${n}`)
          return new this(n)
        }
    
        add(other: { value: number }) { return (this.constructor as any).of(this.value + other.value) }
        sub(other: { value: number }) { return (this.constructor as any).of(this.value - other.value) }
    
        toString() { return `${name}(${this.value})` }
      }
    }
    
    const Uint8  = boundedInt("uint8",   0,    255)
    const Int8   = boundedInt("int8",  -128,    127)
    const Uint16 = boundedInt("uint16",  0,  65535)
    const Int16  = boundedInt("int16", -32768, 32767)
    ```
    
-   **Compile-to-WASM path** — the "fx → js / yo → WASM" angle from `IDEAS-PLANS.md` : once yo has fixed-width types, a backend that emits WebAssembly gives near-native speed for hot paths (ties into ocraft's WASM learning goal + the `wasm-add-fn` node). yo stays the _expressive/safe interpreter_ end; this is the _typed/compiled_ end.
    

Related: turboscript · [programming languages](/doc/programming-languages)
