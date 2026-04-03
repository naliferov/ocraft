export const getTime = () => {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))
