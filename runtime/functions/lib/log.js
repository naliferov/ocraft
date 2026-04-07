import { getTime } from './time.js'

export const log = (msg, addTime = false) => {
  const str = addTime ? `${getTime()} ${msg}` : msg
  console.log(str)
}
