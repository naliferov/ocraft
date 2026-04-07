(x) => {
  x.f = (showHideBtn) => {
    const target = x.x('extract-value-from-class', { 
      classList: showHideBtn.classList, 
      startsWith: 'target--' 
    })

    if (target === 'next-element-sibling') {
      const targetObj = showHideBtn.nextElementSibling
      targetObj.classList.toggle('hidden')
    }
  }
}