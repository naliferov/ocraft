# system

Сгенерировано из `system-tree.json` (корень репозитория).

```bash
npm run sync:system
```

В каждой папке узла: `node.json` (метаданные без `children`/`items`). Для `kind: fn` код в `code.js` или `code.css` (`codeFile` в node.json). Для узлов с `tag`+текст — `inline.js`.
