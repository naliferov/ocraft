export default (x) => {
  const who = x.args[0]?.name ?? 'world'
  return `greeted ${who}`
}
