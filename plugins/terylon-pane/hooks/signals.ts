// The done-signal and the catch-up summary: what the pane posts into the session. Pure, so a test reads it.
//
//   events_since ──▶ a story moved to verified or blocked, or ended merged / accepted / abandoned
//   work_in_flight ─▶ a story stuck
//        │
//        ▼  ONCE per story and verdict commit (the key, kept in $.store): a new commit is a new signal
//   $.prompt.submit — a turn of its own once the session is idle, never folded into a running one
//
// Back after more than CATCH_UP_AFTER_MS away: ONE summary instead, the signals of the gap inside it.
// More than CATCH_UP_MOST_EVENTS behind: no summary at all, a link to the console. Never a brief, a spec
// or a memory text: events carry transitions only (S3), and only transitions are told.

import { isListStory, list, money, number, text } from './queue'

type Json = Record<string, unknown>

// Away longer than this and the pane posts one summary rather than the signals one by one (S15, answer c).
export const CATCH_UP_AFTER_MS = 2 * 60 * 60 * 1000

// More events than this since the last look and a summary would not be whole; the console says it instead.
export const CATCH_UP_MOST_EVENTS = 2000

// The most events one events_since page answers (Terylon, LeaderEventsEndpoints).
export const EVENTS_PAGE = 500

// How many signal keys the store keeps; older ones cannot come again, their stories have moved on.
export const SIGNALS_KEPT = 300

export type SignalKind = 'verified' | 'merged' | 'accepted' | 'abandoned' | 'blocked' | 'stuck'

export type Candidate = { story: number; kind: SignalKind; seq: number; title: string; pullRequest: number | null; reason: string | null }

export type Signal = { key: string; story: number; kind: SignalKind; prompt: string; toast: string }

// The verdict a verified story carries: its commit, its environment, its pull request, and whether the story is in
// Terylon's own list, which waits for the owner's Accept rather than a merge.
export type Verdict = { commit: string | null; environment: string | null; pullRequest: number | null; isList: boolean }

function pullRequestOf(value: unknown): number | null {
  if (typeof value === 'number') {
    return value
  }

  return number((value as Json | null)?.id)
}

export function candidatesFromEvents(events: Json[]): Candidate[] {
  const found: Candidate[] = []

  for (const event of events) {
    if (event.type !== 'StoryMoved' || number(event.story) === null) {
      continue
    }

    const outcome = text(event.outcome)
    const to = text(event.to)
    const kind: SignalKind | null =
      outcome === 'merged' || outcome === 'accepted' || outcome === 'abandoned'
        ? outcome
        : to === 'verified' || to === 'blocked'
          ? to
          : null

    if (kind !== null) {
      found.push({
        story: number(event.story) ?? 0,
        kind,
        seq: number(event.seq) ?? 0,
        title: text(event.title) ?? '',
        pullRequest: pullRequestOf(event.pullRequest),
        reason: null,
      })
    }
  }

  return found
}

export function candidatesFromFlight(flight: Json): Candidate[] {
  return list(flight.stories)
    .filter(story => story.stuck !== null && typeof story.stuck === 'object')
    .map(story => {
      const stuck = story.stuck as Json

      return {
        story: number(story.id) ?? 0,
        kind: 'stuck' as const,
        seq: Date.parse(String(stuck.since ?? '')) || 0,
        title: text(story.title) ?? '',
        pullRequest: null,
        reason: text(stuck.reason),
      }
    })
}

export function signalKey(candidate: Candidate, verdict: Verdict | null): string {
  const which = candidate.kind === 'verified' && verdict?.commit != null ? verdict.commit : String(candidate.seq)

  return `${candidate.story}:${candidate.kind}:${which}`
}

export function signalFor(candidate: Candidate, verdict: Verdict | null): Signal {
  const story = candidate.story
  const named = `Story #${story} „${candidate.title}“`
  const pullRequest = verdict?.pullRequest ?? candidate.pullRequest
  const commit = verdict?.commit != null ? verdict.commit.slice(0, 7) : null
  const where = [pullRequest === null ? null : `PR ${pullRequest}`, commit === null ? null : `commit ${commit}`].filter(part => part !== null).join(', ')
  const environment = verdict?.environment ?? null
  let prompt: string
  let toast: string

  switch (candidate.kind) {
    case 'verified':
      if (verdict?.isList === true) {
        prompt = `${named} je ověřená${environment === null ? '' : ` v ${environment}`} a čeká na moje přijetí (Accept)${where === '' ? '' : ` (${where})`}. Shrň mi důkazy a co mám proklikat, než ji přijmu.`
        toast = `Terylon: #${story} verified, waiting for Accept`
        break
      }

      prompt = `${named} je ověřená${environment === null ? '' : ` v ${environment}`} a čeká na merge${where === '' ? '' : ` (${where})`}. Shrň mi důkazy a co mám proklikat.`
      toast = `Terylon: #${story} verified, waiting for merge`
      break
    case 'merged':
      prompt = `${named} je mergnutá${where === '' ? '' : ` (${where})`}. Shrň mi, co se změnilo a co ověřit v produkci.`
      toast = `Terylon: #${story} merged`
      break
    case 'accepted':
      prompt = `${named} je přijatá bez merge. Shrň mi, s čím byla přijata.`
      toast = `Terylon: #${story} accepted`
      break
    case 'abandoned':
      prompt = `${named} je opuštěná. Shrň mi proč a co z ní zůstalo.`
      toast = `Terylon: #${story} abandoned`
      break
    case 'blocked':
      prompt = `${named} je zablokovaná. Shrň mi proč a co potřebuje ode mě.`
      toast = `Terylon: #${story} blocked`
      break
    case 'stuck':
      prompt = `${named} se zasekla${candidate.reason === null ? '' : `: ${candidate.reason}`}. Shrň mi, co potřebuje.`
      toast = `Terylon: #${story} stuck`
      break
  }

  return { key: signalKey(candidate, verdict), story, kind: candidate.kind, prompt, toast }
}

export function verdictOf(story: Json): Verdict {
  // story_get's `verdict` is the latest verdict, or the owner's verdict as a plain sentence; `verdicts` holds them all.
  const verdicts = list(story.verdicts).filter(item => item.superseded !== true)
  const verdict = (story.verdict !== null && typeof story.verdict === 'object' ? story.verdict : verdicts[verdicts.length - 1] ?? null) as Json | null
  const pullRequest = (story.pullRequest ?? null) as Json | number | null

  return {
    commit: text(verdict?.commit),
    environment: text(verdict?.environment) ?? text((story.environment as Json | null)?.name),
    pullRequest: pullRequestOf(pullRequest),
    isList: isListStory({ ...story, state: 'verified' }),
  }
}

function hours(milliseconds: number): string {
  return `${Math.max(1, Math.round(milliseconds / 3600000))} h`
}

// The one summary posted on a return after CATCH_UP_AFTER_MS: done, waiting for you, running, stuck, spend.
export function catchUpSummary(input: { awayMs: number; events: Json[]; briefing: Json; flight: Json; policy: Json | null }): { prompt: string; waitingCount: number; band: string } {
  const ended = candidatesFromEvents(input.events).filter(candidate => candidate.kind === 'merged' || candidate.kind === 'accepted' || candidate.kind === 'abandoned')
  const done = ended.map(candidate => `#${candidate.story} ${candidate.kind === 'merged' ? 'mergnutá' : candidate.kind === 'accepted' ? 'přijatá' : 'opuštěná'}`)
  const verified = list(input.briefing.storiesVerified).map(story => `#${number(story.id) ?? 0} ověřená (${text(story.target) === 'list' ? 'accept' : 'merge'})`)
  const plans = list(input.briefing.plansWaiting).map(plan => `plán ${number(plan.id) ?? 0}, ${number(plan.stories) ?? 0} story (schválení)`)
  const questions = list(input.briefing.questionsOpen).map(question => `otázka ${number(question.id) ?? 0}`)
  const waiting = [...verified, ...plans, ...questions]
  const running = list(input.flight.stories).map(story => {
    const progress = (story.progress ?? null) as Json | null
    const step = number(progress?.step)
    const steps = number(progress?.steps)

    return `#${number(story.id) ?? 0} ${story.state === 'verifying' ? 'ověřuje se' : step !== null && steps !== null ? `krok ${step}/${steps}` : String(story.state ?? '')}`
  })
  const blocked = [
    ...list(input.briefing.storiesBlocked).map(story => `#${number(story.id) ?? 0} zablokovaná: ${text(story.blockedReason) ?? '?'}`),
    ...candidatesFromFlight(input.flight).map(candidate => `#${candidate.story} zaseklá${candidate.reason === null ? '' : `: ${candidate.reason}`}`),
  ]
  const spend = list(input.flight.stories).reduce((sum, story) => sum + (number(story.costUsd) ?? 0), 0)
  const day = number(input.policy?.dayBudgetUsd)
  const line = (label: string, items: string[]) => `**${label}:** ${items.length === 0 ? 'nic' : items.join(' · ')}`
  const prompt = [
    `Terylon, zatímco byl počítač vypnutý (${hours(input.awayMs)}, ${input.events.length} změn)`,
    '',
    line('Hotovo', done),
    line('Čeká na tebe', waiting),
    line('Běží', running),
    line('Zadrhlo se', blocked),
    `**Útrata:** $${money(spend)} v běžících story${day === null ? '' : ` z denního rozpočtu $${day.toFixed(0)}`}.`,
    '',
    'Projdi se mnou, co čeká na mě, od nejstaršího.',
  ].join('\n')

  return { prompt, waitingCount: waiting.length, band: `summary of ${hours(input.awayMs)} posted · ${waiting.length} waiting for you` }
}
