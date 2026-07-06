// CodeMirror 6 editor for script bodies. Loaded via dynamic import from Script.vue so the
// whole CM6 bundle lives in its own chunk, fetched only when a script node opens.
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment, Transaction } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { vue } from '@codemirror/lang-vue'
import { oneDark } from '@codemirror/theme-one-dark'

const language = (scriptType) => (scriptType === 'vue-sfc' ? vue() : javascript())

export function createCodeEditor({ parent, doc, scriptType, onChange, onRun }) {
  const lang = new Compartment()
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        // before basicSetup so it wins over the default Mod-Enter (insertBlankLine)
        keymap.of([{ key: 'Mod-Enter', run: () => (onRun(), true) }]),
        basicSetup,
        keymap.of([indentWithTab]),
        lang.of(language(scriptType)),
        oneDark,
        EditorView.theme({
          '&': { fontSize: '13px', height: '100%', backgroundColor: '#1a1a1a' },
          '.cm-gutters': { backgroundColor: '#161616' },
          '.cm-scroller': {
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontFeatureSettings: "'liga' 0, 'calt' 0",
            lineHeight: '1.6',
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // TEMP DEBUG: log every doc change with its cause — hunting the vanishing-line bug
            for (const tr of update.transactions) {
              if (!tr.docChanged) {
                continue
              }
              const cause = tr.annotation(Transaction.userEvent) ?? '(no userEvent)'
              tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                console.log('[cm-debug]', cause, {
                  deleted: update.startState.doc.sliceString(fromA, toA),
                  inserted: inserted.toString(),
                  at: fromA,
                })
              })
            }
            onChange(update.state.doc.toString())
          }
        }),
      ],
    }),
  })

  return {
    setLanguage: (scriptType) => view.dispatch({ effects: lang.reconfigure(language(scriptType)) }),
    insertAtCursor: (text) => {
      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      })
      view.focus()
    },
    destroy: () => view.destroy(),
  }
}
