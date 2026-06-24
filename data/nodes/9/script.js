export default async (x) => {
  const result = await x.x('8', [{ name: 'ocraft' }])
  x.log(`8 returned: ${result}`)

  //console.log(await x.x("171"))

  return result
}
