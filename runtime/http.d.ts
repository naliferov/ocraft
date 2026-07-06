// Ambient augmentation: handleRequest (api.ts) resolves the session's user once per request and
// bolts it onto the request as req.userId, so every downstream node handler reads it off req.
// undefined = anonymous. A .d.ts (not a .ts) so Node's --experimental-strip-types never executes
// it — tsc still picks it up via the runtime/**/*.ts include and merges it into node:http.
declare module 'http' {
  interface IncomingMessage {
    userId?: string
  }
}

export {}
