export default async (x) => {
  const res = await x.x('10', [10, 20])
  console.log(res.test(257))
}
