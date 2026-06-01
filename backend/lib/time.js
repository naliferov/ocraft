export const getTime = () => new Date().toISOString()

export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))
