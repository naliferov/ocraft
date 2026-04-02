(x) => {

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  x.f = () => {
    let intervalId = null
    const subs = new Set()

    return {
      async start() {
        while (true) {
          await sleep(2000) 
          subs.forEach(fn => fn())
        }
      },

      stop() {},

      subscribe(fn) {
        subs.add(fn)
        return () => subs.delete(fn)
      },
    }

  }

}