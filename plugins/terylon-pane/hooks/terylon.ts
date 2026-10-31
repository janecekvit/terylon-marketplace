// The pane's one way to Terylon: $.mcp.call on the terylon server, through an allow-list.
// The pane reads, adds a task or a goal, answers the leader's question, proposes a memory edit and marks a
// notice handled, and it takes the owner's acts Terylon PR 228 made owner writes (S27, #27): a plan approved or
// sent back, a story returned, unblocked, abandoned, stopped or accepted, the leader paused or resumed, a goal
// dropped, a memory proposal confirmed or dropped, the policy saved. It never merges: merge is the one gate,
// confirmed by the person's passkey in the console, and the pane links there.

// The server `terylon` as the terylon-os plugin registers it (measured on 2.1.296), then as a session that
// added it by hand names it.
export const SERVER_CANDIDATES = ['plugin:terylon-os:terylon', 'terylon'] as const

// The owner's acts, each taken on its subject's card on the owner's press, in one click and with no passkey: every
// former gate but merge, which Terylon PR 228 made an owner write. Copied from Terylon's tool table on main after
// that PR (McpToolTable.cs), never derived; tests/terylon-pane/tool-table.test.js holds this list to the copy.
export const OWNER_ACTS: readonly string[] = [
  'plan_approve',
  'plan_rethink',
  'story_return',
  'story_unblock',
  'story_abandon',
  'story_stop',
  'story_accept',
  'leader_pause',
  'leader_resume',
  'goal_drop',
  'memory_confirm',
  'memory_drop',
  'policy_save',
]

// Every tool the pane may call: what it reads, the five writes that decide nothing — a task, a goal, an answer to
// the leader's question, a memory edit proposed, a notice handled (the owner decided on 2026-10-12, #360, that
// notice_handle is not a gate) — a goal's specification read and revised and its re-plan (Terylon S53; goal_replan
// only on the owner's press, its plan waiting for approval), and the owner's acts above. Never the gate.
export const PANE_TOOLS: ReadonlySet<string> = new Set([
  'briefing',
  'work_in_flight',
  'stories_list',
  'events_since',
  'story_get',
  'policy_get',
  'goals_list',
  'goal_get',
  'plans_list',
  'notices_list',
  'leader_status',
  'metrics',
  'memory_get',
  'tasks_add',
  'goal_add',
  'question_answer',
  'memory_propose',
  'notice_handle',
  'spec_get',
  'spec_revise',
  'goal_replan',
  ...OWNER_ACTS,
])

// The owner's one gate (Terylon main after PR 228, McpGates.cs): never the pane's, whatever it is asked. The person
// confirms a merge with their passkey in the console; the pane shows "Merge in the console ↗".
export const GATE_TOOLS: readonly string[] = ['story_merge']

// A server the session does not have, in the words $.mcp.call rejects with.
export const MISSING_SERVER = /not (found|connected|configured)|no (such|mcp) server|unknown server|is not a server/i

// A call Claude Code itself refused because no allow rule names the tool, in its own words (measured on 2.1.295):
// auto mode's classifier has no request of the model's to judge a mod's call by, and the default mode cannot ask.
export const NOT_ALLOWED = /auto mode classifier|requested permissions to use|permission to use .* (was|has been) denied/i

// The tool names the engine gives the pane's tools on the terylon-os plugin's server, as an allow rule spells them.
export const PANE_TOOL_PREFIX = 'mcp__plugin_terylon-os_terylon__'

// The status a refusal or an error carries in Terylon's text answer: "Refused (403): ...".
const STATUS_IN_TEXT = /\((\d{3})\)/

export type TerylonAnswer =
  | { kind: 'ok'; value: Record<string, unknown> }
  | { kind: 'refused'; status: number | null; sentence: string; console: string | null; value: Record<string, unknown> }
  | { kind: 'no-server' }
  | { kind: 'not-allowed'; reason: string }
  | { kind: 'unreachable'; reason: string }

export class GateRefusedError extends Error {}

export function assertPaneTool(tool: string): void {
  if (GATE_TOOLS.includes(tool) || !PANE_TOOLS.has(tool)) {
    throw new GateRefusedError(`terylon-pane never calls ${tool}: the person decides it in the console`)
  }
}

function parseText(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text)

    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { value: parsed }
  } catch {
    // A text answer that is not JSON is the server's sentence; keep it as one.
    return { sentence: text }
  }
}

export function readResult(result: { content: readonly { type: string; text?: string }[]; isError?: boolean; structuredContent?: unknown }): TerylonAnswer {
  const structured = result.structuredContent
  const text = result.content.map(block => block.text ?? '').join('')
  const value =
    structured !== null && typeof structured === 'object' ? (structured as Record<string, unknown>) : parseText(text)

  if (result.isError !== true) {
    return { kind: 'ok', value }
  }

  const refused = typeof value.refused === 'string' ? value.refused : typeof value.sentence === 'string' ? value.sentence : text
  const status = typeof value.status === 'number' ? value.status : Number(STATUS_IN_TEXT.exec(text)?.[1] ?? NaN)

  return {
    kind: 'refused',
    status: Number.isFinite(status) ? status : null,
    sentence: refused,
    console: typeof value.console === 'string' ? value.console : null,
    value,
  }
}

// The permissions block that lets the pane call its own tools and nothing else: never the gate. The Status tab draws
// it as `Code` in json (S32), to be selected and copied by hand: `$.ui.copy` does not work in Desktop.
export function allowRules(): string {
  const lines = [...PANE_TOOLS].map(tool => `    "${PANE_TOOL_PREFIX}${tool}"`)

  return ['"permissions": {', '  "allow": [', lines.join(',\n'), '  ]', '}'].join('\n')
}

// The acts whose field must say something before they are sent: a plan sent back carries its comment, a story
// returned its note. Unblock, Abandon and Pause offer a field and send without it.
export const NEEDS_TEXT: ReadonlySet<string> = new Set(['plan_rethink', 'story_return'])

// THE LONGEST TEXT EACH ACT TAKES, in characters (Terylon main aaf07e8): the leader refuses a longer one.
export const TEXT_LIMITS: Readonly<Record<string, number>> = { plan_rethink: 2000, story_return: 4000, story_unblock: 4000 }

// The acts that name a subject: sent only with its id. The leader's two and the policy name none.
const NEEDS_SUBJECT: ReadonlySet<string> = new Set(OWNER_ACTS.filter(tool => !tool.startsWith('leader_') && tool !== 'policy_save'))

// WHETHER AN ACT MAY BE SENT. Terylon does not check an act's arguments against a schema (Terylon main aaf07e8),
// so the pane does: a subject's id present, and the text a plan sent back or a story returned carries.
export function isSendable(tool: string, subject: number | null, words: string): boolean {
  if (NEEDS_SUBJECT.has(tool) && !(subject !== null && Number.isInteger(subject) && subject > 0)) {
    return false
  }

  const limit = TEXT_LIMITS[tool]

  if (limit !== undefined && words.trim().length > limit) {
    return false
  }

  return !(NEEDS_TEXT.has(tool) && words.trim() === '')
}

// WHAT EACH ACT SENDS, in one place, as Terylon main aaf07e8 declares each tool: the subject's id ({plan}, {story},
// {goal}, {proposal}), and the owner's words as `comment`, `note` or `reason`. plan_approve also takes stories? and
// edits?, and memory_confirm a text?: the pane sends neither, so picking stories, editing criteria and editing a
// proposal stay the console's. A blank text counts as absent there, so the pane sends none.
export function actArguments(tool: string, subject: number | null, words: string): Record<string, unknown> {
  const said = words.trim()
  const optional = (name: string) => (said === '' ? {} : { [name]: said })

  switch (tool) {
    case 'plan_approve':
      return { plan: subject }
    case 'plan_rethink':
      return { plan: subject, comment: said }
    case 'story_return':
      return { story: subject, note: said }
    case 'story_unblock':
      return { story: subject, ...optional('note') }
    case 'story_abandon':
      return { story: subject, ...optional('reason') }
    case 'story_stop':
    case 'story_accept':
      return { story: subject }
    case 'leader_pause':
      return optional('reason')
    case 'leader_resume':
      return {}
    case 'goal_drop':
      return { goal: subject }
    case 'memory_confirm':
    case 'memory_drop':
      return { proposal: subject }
    default:
      return {}
  }
}
