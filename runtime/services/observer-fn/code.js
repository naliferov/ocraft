(x) => {
  const config = { attributes: true, childList: true, subtree: true }
  const callback = (mutationList, observer) => {
    for (const mutation of mutationList) {
      console.log('type', mutation.type)
    }
  }

  //const ob = new MutationObserver(callback)
}