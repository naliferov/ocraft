// A caller. Invokes node "8" (greeter) by its bare id via x.x and uses the result.
// The id "8" is all that's stored; the editor's picker showed you it was "greeter".
export default async (x) => {
  const result = await x.x("8", [{ name: 'ocraft' }])
  x.log(`8 returned: ${result}`)
  return result
}
