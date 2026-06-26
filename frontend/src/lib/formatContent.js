// Client-side content formatting — NO backend. Pretty-prints html / markdown node content
// with prettier's browser build, lazy-imported so prettier lands in its own chunk (off the
// main bundle) and only loads the first time you format. Used by the html editor's Format
// button + the terminal `format` command.
export const formatContent = async (text, parser = 'html') => {
  const prettier = await import('prettier/standalone')
  const plugin =
    parser === 'markdown'
      ? await import('prettier/plugins/markdown')
      : await import('prettier/plugins/html')
  return prettier.format(text, { parser, plugins: [plugin], printWidth: 100 })
}
