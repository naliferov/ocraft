// AI runner for the generic run controller (kernel/runs.js): wraps the Claude
// Agent SDK's query() into a tracked run. Starts a Claude Code session, streams its
// events through the run hooks, and exposes cancel() via an AbortController.
//
// ⚠️ SECURITY: same as the legacy /api/ai-chat — this runs Claude with
// permissionMode 'bypassPermissions' and full Read/Write/Edit/Bash, cwd = repo
// root. Localhost single-user dev only; do not expose the API to a network. Auth is
// the local Claude Code login (~/.claude / CLAUDE_CODE_OAUTH_TOKEN); no API key.
//
// settingSources includes 'project' so the repo's .claude/ loads — its CLAUDE.md
// and especially its skills (e.g. minimal-txt). Without that the SDK loads no
// filesystem settings and "run the <name> skill" prompts have nothing to invoke.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Render prior chat turns as plain context (same shape the legacy ai-chat used).
const buildChatPrompt = (history, message) => {
  if (!history?.length) {
    return message
  }
  const transcript = history
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`)
    .join('\n\n')
  return `Continuing our conversation. History so far:\n\n${transcript}\n\nUser: ${message}`
}

// input: { message?, history?, prompt?, resume?, maxTurns?, label? }
export const start = (input, hooks) => {
  const abortController = new AbortController()

  ;(async () => {
    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk') // lazy
      const prompt = input.prompt ?? buildChatPrompt(input.history, input.message)
      if (!prompt) {
        throw new Error('ai run needs `message` or `prompt`')
      }

      for await (const event of query({
        prompt,
        options: {
          cwd: ROOT_DIR,
          permissionMode: 'bypassPermissions',
          maxTurns: input.maxTurns ?? 30,
          includePartialMessages: true, // emit stream_event text deltas for live UI
          settingSources: ['project'], // load .claude/ (CLAUDE.md + skills)
          abortController,
          ...(input.resume ? { resume: input.resume } : {}),
        },
      })) {
        if (event.type === 'system' && event.subtype === 'init') {
          hooks.onSession(event.session_id)
        } else if (event.type === 'stream_event') {
          const inner = event.event
          if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
            hooks.onText(inner.delta.text)
          }
        } else if (event.type === 'assistant') {
          for (const block of event.message?.content ?? []) {
            if (block.type === 'tool_use') {
              hooks.onTool({ name: block.name, input: block.input })
            }
          }
        } else if (event.type === 'result') {
          hooks.onResult({
            subtype: event.subtype,
            cost: event.total_cost_usd,
            turns: event.num_turns,
            sessionId: event.session_id,
            text: typeof event.result === 'string' ? event.result : undefined,
          })
        }
      }
      hooks.onDone()
    } catch (err) {
      // cancel() aborts the controller → the iterator throws; the controller has
      // already marked the run cancelled, so swallow the abort and don't re-finish.
      if (!abortController.signal.aborted) {
        hooks.onError(err)
      }
    }
  })()

  return { cancel: () => abortController.abort() }
}
