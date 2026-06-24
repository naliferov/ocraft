// api-runs-monitor — a live view of the generic /api/runs controller.
//
// Polls GET /api/runs every 1.5s and renders one row per run (status dot, label,
// age, cost) with a Cancel button while running. Click a run to load its full
// detail (log, tools, output text) from GET /api/runs/:id. This is the "see
// running processes" surface: the html-note "minimal-txt" action starts an AI run
// and navigates here so you can watch it and read the result.
//
// Uses x.ui only to claim a panel; the table itself is plain DOM (browser run).
export default async (x) => {
  const STATUS_COLOR = { running: '#6cf', done: '#9f9', error: '#f99', cancelled: '#caa' }
  // Elapsed start→end. While running there's no finishedAt, so measure to now (ticks
  // live); once done/error/cancelled, measure to finishedAt so it FREEZES at the
  // run's real duration instead of climbing forever.
  const age = (startIso, finishIso) => {
    const end = finishIso ? new Date(finishIso).getTime() : Date.now()
    const s = Math.max(0, (end - new Date(startIso).getTime()) / 1000)
    return s < 60 ? `${s | 0}s` : s < 3600 ? `${(s / 60) | 0}m` : `${(s / 3600) | 0}h`
  }

  x.ui.text('api-runs-monitor — polling GET /api/runs every 1.5s')
  const summary = x.ui.text('loading…')

  // Claim a row element and turn it into a vertical list container.
  const list = x.ui.row(() => {})
  Object.assign(list.style, {
    flexDirection: 'column',
    alignItems: 'stretch',
    width: '100%',
    gap: '4px',
  })

  const out = x.ui.log({ height: '240px' })
  let selected = null

  const showDetail = async (id) => {
    selected = id
    out.clear()
    out.push(`loading run ${id}…`, 'sys')
    try {
      const r = await (await fetch(`/api/runs/${id}`)).json()
      out.clear()
      const bits = [r.label, r.status, r.kind]
      if (r.cost != null) bits.push(`$${r.cost.toFixed(4)}`)
      if (r.turns != null) bits.push(`${r.turns} turns`)
      out.push(bits.join(' · '), 'sys')
      if (r.sessionId) out.push(`session ${r.sessionId}`, 'sys')
      for (const line of r.log ?? []) out.push(line.msg, 'sys')
      if (r.text) out.push(r.text, 'down')
      if (r.error) out.push(`error: ${r.error}`, 'up')
    } catch (e) {
      out.push(`detail failed: ${e.message}`, 'up')
    }
  }

  const render = (runs) => {
    summary.set(
      `${runs.length} runs · ${runs.filter((r) => r.status === 'running').length} running`,
    )
    list.replaceChildren()
    for (const r of runs) {
      const row = document.createElement('div')
      Object.assign(row.style, {
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        padding: '4px 8px',
        background: r.id === selected ? '#1f2a33' : '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: '4px',
        fontSize: '12.5px',
      })

      const dot = document.createElement('span')
      dot.textContent = '●'
      dot.style.color = STATUS_COLOR[r.status] ?? '#888'

      const label = document.createElement('span')
      label.textContent = r.label
      label.title = `${r.kind} · ${r.id}`
      Object.assign(label.style, {
        flex: '1',
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      })
      label.addEventListener('click', () => showDetail(r.id))

      const meta = document.createElement('span')
      Object.assign(meta.style, { color: '#888', flexShrink: '0' })
      meta.textContent = `${r.kind} · ${r.status} · ${age(r.startedAt, r.finishedAt)}${r.cost != null ? ` · $${r.cost.toFixed(3)}` : ''}`

      row.append(dot, label, meta)

      // Only 'ai' runs are cancellable here; services/tasks are observe-only (started
      // + stopped via the CLI/scheduler), so no cancel button for those rows.
      if (r.status === 'running' && r.kind === 'ai') {
        const cancel = document.createElement('button')
        cancel.textContent = 'cancel'
        Object.assign(cancel.style, {
          fontSize: '11px',
          padding: '2px 8px',
          background: '#222',
          color: '#d4d4d4',
          border: '1px solid #3a3a3a',
          borderRadius: '4px',
          cursor: 'pointer',
        })
        cancel.addEventListener('click', async () => {
          cancel.disabled = true
          try {
            await fetch(`/api/runs/${r.id}/cancel`, { method: 'POST' })
          } catch {
            // ignore — next poll reflects state
          }
          poll()
        })
        row.append(cancel)
      }
      list.append(row)
    }
  }

  const poll = async () => {
    try {
      const runs = await (await fetch('/api/runs')).json()
      render(runs)
      if (selected && runs.find((r) => r.id === selected)?.status === 'running')
        showDetail(selected)
    } catch (e) {
      summary.set(`poll failed: ${e.message}`)
    }
  }

  await poll()
  const timer = setInterval(poll, 1500)
  x.ui.onCleanup(() => clearInterval(timer))
}
