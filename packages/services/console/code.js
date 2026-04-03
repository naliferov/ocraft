(x) => {
  const el = x.parentNode.children[1]

  x.f = (str) => {
    el.innerHTML += `<div>${str}<div>`
  }
}