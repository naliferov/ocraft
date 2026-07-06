import { getTime } from './time.ts'

export const log = (msg, addTime = false) => {
  const str = addTime ? `${getTime()} ${msg}` : msg
  console.log(str)
}
