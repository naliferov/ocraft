(x) => {
  x.f = ({ classList, startsWith }) => {
    const extractValue = kvStr => {
        return kvStr.split('--')[1] ?? ''
    }

    for (const cls of classList) {
      if (cls.startsWith(startsWith)) {
        return extractValue(cls)
      }
    }
  }
}