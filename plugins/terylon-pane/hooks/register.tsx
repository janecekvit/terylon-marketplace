// terylon-pane: the Terylon pane in Claude Desktop (S7, #332), built to the approved S15 canvas.
//
//   every 30 s ──▶ $.mcp.call terylon: briefing · work_in_flight · stories_list · events_since
//        │            (through callTerylon's allow-list: NEVER a gate tool)
//        ├──▶ the pane: waiting for you · running · queued or held · done today
//        ├──▶ the done-signal: $.prompt.submit once per story and verdict commit, and a toast
//        └──▶ the status line
//   session start, away > 2 h ──▶ ONE catch-up summary, and a band above the prompt
//   "Přidat" ──▶ tasks_add, which becomes a plan the owner approves in the console
//   "Paměť"  ──▶ memory_get; an edit is memory_propose, confirmed by the owner in the console
//
// The mod holds no rule the endpoint does not: every decision is a Link to the console.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PaneAdd, PaneBand, PaneMemory, PaneSnapshot, PaneStory, PaneView } from '../types'

import { COPY } from './copy'
import { MISSING_SERVER, SERVER_CANDIDATES, assertPaneTool, readResult } from './terylon'
import type { TerylonAnswer } from './terylon'
import { clock, consoleLink, doneTodayItems, header, list, money, number, queuedItems, runningItems, text, waitingItems } from './queue'
import {
  CATCH_UP_AFTER_MS,
  CATCH_UP_MOST_EVENTS,
  EVENTS_PAGE,
  SIGNALS_KEPT,
  candidatesFromEvents,
  candidatesFromFlight,
  catchUpSummary,
  signalFor,
  signalKey,
  verdictOf,
} from './signals'
import type { Candidate, Verdict } from './signals'

type Json = Record<string, unknown>

// The pane's ids, and the commands that open them.
export const PANE = 'terylon'
export const MEMORY_PANE = 'terylon-memory'

// How often the pane asks Terylon, and how often it retries while Terylon does not answer.
export const POLL_MS = 30000
export const RETRY_MS = 60000

// What the store keeps across sessions: where the pane last read the events, when, and what it signalled.
const STORE_LAST_SEQ = 'lastSeq'
const STORE_LAST_SEEN_AT = 'lastSeenAt'
const STORE_SIGNALLED = 'signalled'

const EMPTY_SNAPSHOT: PaneSnapshot = {
  connection: 'connecting',
  problem: null,
  fetchedAt: null,
  header: '',
  paused: null,
  waiting: [],
  running: [],
  queued: [],
  doneToday: [],
}

const EMPTY_ADD: PaneAdd = { phase: 'form', title: '', criteria: '', goal: '', after: '', goals: [], stories: [], sentence: null, link: null }

const EMPTY_MEMORY: PaneMemory = { phase: 'loading', files: [], pending: 0, edit: null, sentence: null }

const snapshot = atom({ plugin: 'terylon-pane', key: 'snapshot' } as const, EMPTY_SNAPSHOT)
const view = atom({ plugin: 'terylon-pane', key: 'view' } as const, { screen: 'queue' } as PaneView)
const story = atom({ plugin: 'terylon-pane', key: 'story' } as const, null as PaneStory | null)
const add = atom({ plugin: 'terylon-pane', key: 'add' } as const, EMPTY_ADD)
const quick = atom({ plugin: 'terylon-pane', key: 'quick' } as const, '')
const band = atom({ plugin: 'terylon-pane', key: 'band' } as const, null as PaneBand)
const memory = atom({ plugin: 'terylon-pane', key: 'memory' } as const, EMPTY_MEMORY)

// What the last answers were: the module's own, lost on a reload and refilled by the next poll.
let lastFlight: Json = {}
let lastBriefing: Json = {}
let lastStories: Json[] = []
let policy: Json | null = null
let lastAttemptAt = 0
let isPolling = false

// Calls one of the pane's tools on whichever terylon server the session has, through the allow-list.
async function callTerylon($: EngineInterface, tool: string, args: Record<string, unknown> = {}): Promise<TerylonAnswer> {
  assertPaneTool(tool)

  let missing = 0
  let reason = ''

  for (const server of SERVER_CANDIDATES) {
    try {
      return readResult((await $.mcp.call(server, tool, args)) as never)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (MISSING_SERVER.test(message)) {
        missing += 1
        continue
      }

      reason = message
      break
    }
  }

  return missing === SERVER_CANDIDATES.length ? { kind: 'no-server' } : { kind: 'unreachable', reason }
}

async function baseUrl($: EngineInterface): Promise<string> {
  return ((await $.env.get('TERYLON_URL')) ?? '').replace(/\/+$/, '')
}

function zoneOffset(now: number): number {
  return new Date(now).getTimezoneOffset()
}

async function failed($: EngineInterface, answer: TerylonAnswer, tool: string): Promise<void> {
  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => {
    switch (answer.kind) {
      case 'no-server':
        return { ...current, connection: 'no-server', problem: null }
      case 'unreachable':
        return { ...current, connection: 'unreachable', problem: answer.reason }
      case 'refused':
        return answer.status === 403
          ? { ...current, connection: 'refused', problem: answer.sentence }
          : { ...current, connection: 'error', problem: `${tool}: ${answer.status ?? answer.sentence}` }
      default:
        return current
    }
  })
}

// One read of the queue. Returns false when Terylon did not answer as the owner's.
async function refresh($: EngineInterface): Promise<boolean> {
  const now = await $.clock.now()
  lastAttemptAt = now

  const flight = await callTerylon($, 'work_in_flight')

  if (flight.kind !== 'ok') {
    await failed($, flight, 'work_in_flight')
    return false
  }

  const briefing = await callTerylon($, 'briefing')

  if (briefing.kind !== 'ok') {
    await failed($, briefing, 'briefing')
    return false
  }

  const stories = await callTerylon($, 'stories_list')

  if (stories.kind !== 'ok') {
    await failed($, stories, 'stories_list')
    return false
  }

  if (policy === null) {
    const answered = await callTerylon($, 'policy_get')
    policy = answered.kind === 'ok' ? answered.value : null
  }

  lastFlight = flight.value
  lastBriefing = briefing.value
  lastStories = list(stories.value.stories)

  const base = await baseUrl($)
  const offset = zoneOffset(now)
  const running = runningItems(lastFlight, offset)
  const inFlight = new Set(running.map(item => item.story))
  const leader = (lastBriefing.leader ?? null) as Json | null
  const isPaused = lastFlight.paused === true

  await update($, snapshot, (): PaneSnapshot => ({
    connection: 'ok',
    problem: null,
    fetchedAt: now,
    header: header(lastFlight, policy),
    paused: isPaused ? COPY.paused(clock(leader?.pausedAt, offset), text(leader?.reason) ?? text(leader?.pauseReason)) : null,
    waiting: waitingItems(lastBriefing, base),
    running,
    queued: queuedItems(lastStories, inFlight),
    doneToday: doneTodayItems(lastStories, now, offset),
  }))

  const current = await read($, snapshot)
  $.ui.status(COPY.status(current.running.length, current.waiting.length))

  return true
}

async function signalled($: EngineInterface): Promise<string[]> {
  const kept = await $.store.get(STORE_SIGNALLED)

  return Array.isArray(kept) ? kept.filter((key): key is string => typeof key === 'string') : []
}

async function verdictFor($: EngineInterface, candidate: Candidate): Promise<Verdict | null> {
  if (candidate.kind !== 'verified') {
    return null
  }

  const answered = await callTerylon($, 'story_get', { story: candidate.story })

  return answered.kind === 'ok' ? verdictOf(answered.value) : null
}

// Reads events_since from the stored sequence, page by page, up to `most` events.
async function readEvents($: EngineInterface, since: number, most: number): Promise<{ events: Json[]; last: number; isWhole: boolean } | null> {
  const events: Json[] = []
  let from = since

  for (;;) {
    const answered = await callTerylon($, 'events_since', { since: from, limit: EVENTS_PAGE })

    if (answered.kind !== 'ok') {
      return null
    }

    const page = answered.value
    events.push(...list(page.events))
    from = number(page.last) ?? from

    if (page.gap === true || events.length > most) {
      return { events, last: number(page.head) ?? from, isWhole: false }
    }

    if (page.more !== true) {
      return { events, last: from, isWhole: true }
    }
  }
}

// THE DONE-SIGNAL: one prompt per story and verdict commit, posted when the session is idle.
async function postSignals($: EngineInterface, candidates: Candidate[]): Promise<void> {
  const done = await signalled($)

  for (const candidate of candidates) {
    const verdict = await verdictFor($, candidate)
    const key = signalKey(candidate, verdict)

    if (done.includes(key)) {
      continue
    }

    const signal = signalFor(candidate, verdict)
    done.push(key)
    await $.store.set(STORE_SIGNALLED, done.slice(-SIGNALS_KEPT))
    await $.prompt.submit({ text: signal.prompt })
    $.ui.toast(signal.toast)
  }
}

async function markSignalled($: EngineInterface, candidates: Candidate[]): Promise<void> {
  const done = await signalled($)

  for (const candidate of candidates) {
    done.push(signalKey(candidate, await verdictFor($, candidate)))
  }

  await $.store.set(STORE_SIGNALLED, done.slice(-SIGNALS_KEPT))
}

// One tick: the queue, then what moved since the last look.
async function tick($: EngineInterface, isStart: boolean): Promise<void> {
  if (isPolling) {
    return
  }

  isPolling = true

  try {
    const now = await $.clock.now()
    const connection = (await read($, snapshot)).connection

    if (!isStart && connection === 'unreachable' && now - lastAttemptAt < RETRY_MS) {
      return
    }

    if (!(await refresh($))) {
      return
    }

    const lastSeq = number(await $.store.get(STORE_LAST_SEQ))
    const lastSeenAt = number(await $.store.get(STORE_LAST_SEEN_AT))

    if (lastSeq === null) {
      // The first look ever: start from now, and tell nothing of the past.
      const head = await callTerylon($, 'events_since', { since: 0, limit: 1 })

      if (head.kind === 'ok') {
        await $.store.set(STORE_LAST_SEQ, number(head.value.head) ?? number(head.value.last) ?? 0)
        await $.store.set(STORE_LAST_SEEN_AT, now)
      }

      return
    }

    const awayMs = lastSeenAt === null ? 0 : now - lastSeenAt
    const isCatchUp = isStart && awayMs > CATCH_UP_AFTER_MS
    const read_ = await readEvents($, lastSeq, CATCH_UP_MOST_EVENTS)

    if (read_ === null) {
      return
    }

    const base = await baseUrl($)
    const candidates = [...candidatesFromEvents(read_.events), ...candidatesFromFlight(lastFlight)]

    if (!read_.isWhole) {
      // Too far behind for a whole summary: say so, link the console, tell nothing piecemeal.
      await markSignalled($, candidates)
      await update($, band, (): PaneBand => ({ text: `${COPY.tooFarHeading} · ${COPY.tooFarBody(String(CATCH_UP_MOST_EVENTS))}`, link: consoleLink(base, 'history'), isAlert: true }))
    } else if (isCatchUp) {
      // Back after a long time away: ONE summary, the gap's signals inside it.
      const summary = catchUpSummary({ awayMs, events: read_.events, briefing: lastBriefing, flight: lastFlight, policy })
      await markSignalled($, candidates)
      await $.prompt.submit({ text: summary.prompt })
      await update($, band, (): PaneBand => ({ text: summary.band, link: consoleLink(base, 'waiting'), isAlert: false }))
    } else {
      await postSignals($, candidates)
    }

    await $.store.set(STORE_LAST_SEQ, read_.last)
    await $.store.set(STORE_LAST_SEEN_AT, now)
  } finally {
    isPolling = false
  }
}

async function openStory($: EngineInterface, id: number): Promise<void> {
  await update($, view, (): PaneView => ({ screen: 'story', story: id }))

  const answered = await callTerylon($, 'story_get', { story: id })
  const now = await $.clock.now()
  const base = await baseUrl($)
  const document = answered.kind === 'ok' ? answered.value : {}
  const inFlight = list(lastFlight.stories).find(item => number(item.id) === id) ?? {}
  const progress = (inFlight.progress ?? document.progress ?? null) as Json | null
  const step = number(progress?.step)
  const steps = number(progress?.steps)
  const startedAt = Date.parse(String(inFlight.startedAt ?? document.startedAt ?? ''))
  const elapsed = Number.isNaN(startedAt) ? '?' : `${Math.floor((now - startedAt) / 3600000)} h ${Math.floor(((now - startedAt) % 3600000) / 60000)} min`
  const pullRequest = (document.pullRequest ?? null) as Json | null
  const question = list(lastBriefing.questionsOpen).find(item => item.subject === `story/${id}`) ?? null
  const budget = number(inFlight.budgetUsd ?? document.budgetUsd)

  await update($, story, (): PaneStory | null => ({
    story: id,
    title: `#${id} ${text(document.title) ?? text(inFlight.title) ?? ''}`.trim(),
    meta: COPY.storyMeta(elapsed, number(inFlight.attempt ?? document.attempt) ?? 1, text(pullRequest?.branch)),
    step: step !== null && steps !== null ? COPY.step(step, steps, text(progress?.current)) : COPY.noStep,
    fraction: step !== null && steps !== null && steps > 0 ? step / steps : null,
    cost: COPY.costOf(money(inFlight.costUsd ?? document.costUsd), budget === null ? null : budget.toFixed(0)),
    question: question === null ? null : text(question.text),
    questionLink: question === null ? null : consoleLink(base, `question&question=${number(question.id) ?? 0}`),
  }))
}

async function openAdd($: EngineInterface, title: string): Promise<void> {
  const goals = await callTerylon($, 'goals_list')
  const choices = goals.kind === 'ok'
    ? list(goals.value.goals)
        .filter(goal => !['done', 'closed', 'abandoned'].includes(String(goal.state)))
        .map(goal => ({ value: String(number(goal.id) ?? 0), label: `${text(goal.title) ?? ''}` }))
    : []
  const stories = lastStories
    .filter(item => !['merged', 'abandoned'].includes(String(item.state)))
    .map(item => ({ value: String(number(item.id) ?? 0), label: `#${number(item.id) ?? 0} ${text(item.title) ?? ''}` }))

  await update($, add, (): PaneAdd => ({ ...EMPTY_ADD, title, goal: choices[0]?.value ?? '', goals: choices, stories: [{ value: '', label: COPY.nothingBefore }, ...stories] }))
  await update($, view, (): PaneView => ({ screen: 'add' }))
}

// ADD A TASK: tasks_add proposes; the plan it becomes waits for the owner in the console.
async function sendTask($: EngineInterface): Promise<void> {
  const form = await read($, add)
  const goal = Number(form.goal)

  if (form.title.trim() === '' || !Number.isInteger(goal) || goal < 1) {
    return
  }

  await update($, add, (current: PaneAdd): PaneAdd => ({ ...current, phase: 'sending' }))

  const after = Number(form.after)
  const task: Json = {
    title: form.title.trim(),
    brief: form.title.trim(),
    criteria: form.criteria.split(';').map(line => line.trim()).filter(line => line !== ''),
    files: [],
    size: 'M',
  }

  if (Number.isInteger(after) && after > 0) {
    task.after = [after]
  }

  const answered = await callTerylon($, 'tasks_add', { goal, tasks: [task] })
  const base = await baseUrl($)
  const isPaused = lastFlight.paused === true

  await update($, add, (current: PaneAdd): PaneAdd => {
    if (answered.kind === 'ok' && answered.value.accepted === true) {
      return { ...current, phase: 'added', sentence: text(answered.value.sentence), link: consoleLink(base, `plan&goal=${goal}`) }
    }

    if (answered.kind === 'ok' && answered.value.accepted == null) {
      return isPaused
        ? { ...current, phase: 'paused', sentence: COPY.pausedAdd, link: null }
        : { ...current, phase: 'timeout', sentence: COPY.timeout(text(answered.value.commandId)), link: null }
    }

    const sentence = answered.kind === 'refused' ? answered.sentence : answered.kind === 'ok' ? text(answered.value.sentence) : COPY.addAfterReconnect

    return { ...current, phase: 'refused', sentence, link: null }
  })
}

async function openMemory($: EngineInterface): Promise<void> {
  await update($, memory, (): PaneMemory => EMPTY_MEMORY)

  const answered = await callTerylon($, 'memory_get')

  if (answered.kind !== 'ok') {
    await update($, memory, (current: PaneMemory): PaneMemory => ({ ...current, phase: 'error', sentence: answered.kind === 'refused' ? answered.sentence : answered.kind }))
    return
  }

  const files = list(answered.value.files).map(file => ({
    file: text(file.file) ?? '',
    heading: text(file.file) ?? '',
    entries: Array.isArray(file.entries) ? file.entries.filter((entry): entry is string => typeof entry === 'string') : [],
    text: text(file.text),
  }))

  await update($, memory, (): PaneMemory => ({ phase: 'ok', files, pending: list(answered.value.proposals).length, edit: null, sentence: null }))
}

// A MEMORY EDIT IS A PROPOSAL: memory_propose, then the owner confirms it in the console's memory gate.
async function proposeMemory($: EngineInterface): Promise<void> {
  const state = await read($, memory)
  const edit = state.edit

  if (edit === null || edit.why.trim() === '' || (edit.action !== 'remove' && edit.text.trim() === '')) {
    return
  }

  await update($, memory, (current: PaneMemory): PaneMemory => ({ ...current, phase: 'sending' }))

  const args: Json = { action: edit.action, file: edit.file, why: edit.why.trim() }

  if (edit.action !== 'remove') {
    args.text = edit.text.trim()
  }

  if (edit.oldText !== null) {
    args.oldText = edit.oldText
  }

  const answered = await callTerylon($, 'memory_propose', args)

  await update($, memory, (current: PaneMemory): PaneMemory => {
    if (answered.kind === 'ok') {
      return { ...current, phase: 'proposed', sentence: answered.value.gate === 'checking' ? COPY.memoryChecking : COPY.memoryProposed }
    }

    const value = answered.kind === 'refused' ? answered.value : {}

    return { ...current, phase: 'refused', sentence: text(value.refusal) ?? (answered.kind === 'refused' ? answered.sentence : answered.kind) }
  })
}

function bar(fraction: number | null): string {
  if (fraction === null) {
    return ''
  }

  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * 20)

  return `${'█'.repeat(filled)}${'░'.repeat(20 - filled)}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'terylon', description: 'Otevře panel Terylon: fronta, přidat úkol, signál hotovo' })
    await $.command.register({ name: 'terylon-memory', description: 'Otevře paměť lídra Terylonu: návrh úpravy potvrdíš v konzoli' })
    void $.ui.open({ id: PANE, title: COPY.title })
    $.clock.after(0, () => tick($, true))
    $.clock.every(POLL_MS, () => tick($, false))

    return next(e)
  })

  on('command.run', { command: 'terylon' }, async $ => {
    await $.ui.open({ id: PANE, title: COPY.title })

    return { text: 'Panel Terylon je otevřený.' }
  })

  on('command.run', { command: 'terylon-memory' }, async $ => {
    await $.ui.open({ id: MEMORY_PANE, title: COPY.memoryTitle })
    await openMemory($)

    return { text: 'Paměť lídra je otevřená.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, band)

    if (shown === null || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text, Link, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={1}>
        <Text bold>T</Text>
        <Text color={shown.isAlert ? 'warning' : undefined}>{shown.text}</Text>
        <Link href={shown.link} label="Konzole ↗" />
        <Button key="band-hide" label="✕" role="dismiss" onPress={() => update($, band, (): PaneBand => null)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: MEMORY_PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button, Link } = elements
    const state = await read($, memory)
    const base = await baseUrl($)
    const memoryLink = consoleLink(base, 'memory')

    if (state.phase === 'loading') {
      return <Text dimColor>{COPY.memoryLoading}</Text>
    }

    if (state.phase === 'error') {
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="error">{COPY.memoryError(state.sentence ?? '?')}</Text>
          <Button key="mem-retry" label={COPY.retry} onPress={() => openMemory($)} />
        </Box>
      )
    }

    if (state.edit !== null && (state.phase === 'editing' || state.phase === 'sending' || state.phase === 'proposed' || state.phase === 'refused')) {
      const edit = state.edit
      const isPhone = e.surface === 'mobile'

      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>{edit.file}</Text>
          {edit.oldText !== null && <Text dimColor>{edit.oldText}</Text>}
          {state.phase === 'editing' && !isPhone && 'Input' in elements && edit.action !== 'remove' && (
            <elements.Input key="mem-text" label={COPY.memoryText} value={edit.text} onInput={value => update($, memory, (current: PaneMemory): PaneMemory => ({ ...current, edit: current.edit === null ? null : { ...current.edit, text: value } }))} onSubmit={() => undefined} />
          )}
          {state.phase === 'editing' && !isPhone && 'Input' in elements && (
            <elements.Input key="mem-why" label={COPY.memoryWhy} value={edit.why} onInput={value => update($, memory, (current: PaneMemory): PaneMemory => ({ ...current, edit: current.edit === null ? null : { ...current.edit, why: value } }))} onSubmit={() => proposeMemory($)} />
          )}
          {state.phase === 'editing' && (
            <Box flexDirection="row" gap={1}>
              <Button key="mem-cancel" label={COPY.cancel} onPress={() => update($, memory, (current: PaneMemory): PaneMemory => ({ ...current, phase: 'ok', edit: null }))} />
              <Button key="mem-propose" label={COPY.memoryPropose} variant="primary" onPress={() => proposeMemory($)} />
            </Box>
          )}
          {state.phase === 'sending' && <Text dimColor>{COPY.memorySending}</Text>}
          {(state.phase === 'proposed' || state.phase === 'refused') && (
            <Box flexDirection="column" gap={1}>
              <Text color={state.phase === 'refused' ? 'error' : 'success'}>{state.sentence ?? ''}</Text>
              <Link href={memoryLink} label={COPY.memoryConfirmInConsole} />
              <Button key="mem-back" label={COPY.memoryBack} onPress={() => openMemory($)} />
            </Box>
          )}
          <Text dimColor>{COPY.memoryNote}</Text>
        </Box>
      )
    }

    const startEdit = (action: 'add' | 'replace' | 'remove', file: string, oldText: string | null) =>
      update($, memory, (current: PaneMemory): PaneMemory => ({ ...current, phase: 'editing', edit: { action, file, oldText, text: action === 'replace' ? oldText ?? '' : '', why: '' } }))

    return (
      <Box flexDirection="column" gap={1}>
        {state.pending > 0 && <Link href={memoryLink} label={COPY.memoryPending(state.pending)} />}
        {state.files.length === 0 && <Text dimColor>{COPY.memoryEmpty}</Text>}
        {state.files.map((file, fileIndex) => (
          <Box key={`mem-file-${fileIndex}`} flexDirection="column">
            <Text bold>{file.heading}</Text>
            {file.text !== null && <Text dimColor>{COPY.topicNote}</Text>}
            {file.entries.map((entry, entryIndex) => (
              <Box key={`mem-entry-${fileIndex}-${entryIndex}`} flexDirection="row" gap={1}>
                <Text>{entry}</Text>
                <Button key={`mem-edit-${fileIndex}-${entryIndex}`} label={COPY.memoryEdit} onPress={() => startEdit('replace', file.file, entry)} />
                <Button key={`mem-remove-${fileIndex}-${entryIndex}`} label={COPY.memoryRemove} onPress={() => startEdit('remove', file.file, entry)} />
              </Box>
            ))}
            {file.text === null && <Button key={`mem-add-${fileIndex}`} label={COPY.memoryAdd} onPress={() => startEdit('add', file.file, null)} />}
          </Box>
        ))}
        <Text dimColor>{COPY.memoryNote}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button, Link, Markdown } = elements
    const hasInput = e.surface !== 'mobile' && 'Input' in elements
    const current = await read($, snapshot)
    const screen = await read($, view)
    const now = await $.clock.now()
    const base = await baseUrl($)
    const offset = zoneOffset(now)
    const age = current.fetchedAt === null ? null : COPY.ago(Math.max(0, Math.round((now - current.fetchedAt) / 1000)))

    const top = (
      <Box key="top" flexDirection="row" gap={1}>
        <Text bold>{COPY.title}</Text>
        <Text color={current.connection === 'ok' ? 'success' : 'warning'}>{current.connection === 'connecting' ? COPY.connecting : age ?? ''}</Text>
        <Button key="refresh" label={COPY.refresh} onPress={() => tick($, false)} />
        <Button key="open-memory" label={COPY.memory} onPress={async () => { await $.ui.open({ id: MEMORY_PANE, title: COPY.memoryTitle }); await openMemory($) }} />
      </Box>
    )

    if (current.connection === 'no-server') {
      return (
        <Box flexDirection="column" gap={1}>
          {top}
          <Text>{COPY.noServerTitle}</Text>
          <Markdown text={'`' + COPY.noServerCommand + '`'} />
          <Text dimColor>{COPY.noServerNoToken}</Text>
          <Button key="retry" label={COPY.retry} onPress={() => tick($, true)} />
        </Box>
      )
    }

    if (current.connection === 'connecting') {
      return (
        <Box flexDirection="column" gap={1}>
          {top}
          <Text dimColor>{COPY.connecting}</Text>
        </Box>
      )
    }

    if (current.connection === 'refused' || current.connection === 'error') {
      return (
        <Box flexDirection="column" gap={1}>
          {top}
          <Text bold color="error">{current.connection === 'refused' ? COPY.refusedHeading : COPY.errorHeading}</Text>
          <Text>{current.connection === 'refused' ? COPY.refusedBody : COPY.errorBody(current.problem ?? '?')}</Text>
          <Button key="retry" label={COPY.retry} onPress={() => tick($, true)} />
        </Box>
      )
    }

    const isStale = current.connection === 'unreachable'

    if (screen.screen === 'story' && !isStale) {
      const shown = await read($, story)

      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1}>
            <Button key="back" label={COPY.back} onPress={() => update($, view, (): PaneView => ({ screen: 'queue' }))} />
            <Text dimColor>{age ?? ''}</Text>
          </Box>
          {shown === null || shown.story !== screen.story ? (
            <Text dimColor>{COPY.connecting}</Text>
          ) : (
            <Box flexDirection="column" gap={1}>
              <Text bold>{shown.title}</Text>
              <Text dimColor>{shown.meta}</Text>
              <Text>{shown.step}</Text>
              <Text>{bar(shown.fraction)} {shown.cost}</Text>
              {shown.question !== null && (
                <Box flexDirection="column">
                  <Text color="warning">{COPY.questionFromRun}</Text>
                  <Text>{shown.question}</Text>
                  {shown.questionLink !== null && <Link href={shown.questionLink} label={COPY.answerInConsole} />}
                </Box>
              )}
              <Box flexDirection="row" gap={1}>
                <Button key="summarise" label={COPY.summariseInSession} onPress={() => $.prompt.submit({ text: COPY.summarisePrompt(screen.story) })} />
                <Link href={consoleLink(base, `work&story=${screen.story}`)} label={COPY.inConsole} />
              </Box>
              <Text dimColor>{COPY.summariseNote}</Text>
            </Box>
          )}
        </Box>
      )
    }

    if (screen.screen === 'add' && !isStale && hasInput) {
      const form = await read($, add)

      if (form.phase === 'sending') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold>{COPY.newTask}</Text>
            <Text dimColor>{form.title}</Text>
            <Text>{COPY.sending}</Text>
          </Box>
        )
      }

      if (form.phase === 'added') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold color="success">{COPY.added}</Text>
            <Text>{form.sentence ?? ''}</Text>
            {form.link !== null && <Link href={form.link} label={COPY.approveInConsole} />}
            <Text dimColor>{COPY.addedNote}</Text>
            <Button key="add-next" label={COPY.nextTask} onPress={() => openAdd($, '')} />
            <Button key="back" label={COPY.back} onPress={() => update($, view, (): PaneView => ({ screen: 'queue' }))} />
          </Box>
        )
      }

      if (form.phase === 'refused' || form.phase === 'timeout' || form.phase === 'paused') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold color={form.phase === 'paused' ? 'warning' : 'error'}>{form.phase === 'paused' ? COPY.added : COPY.notAdded}</Text>
            <Text>{form.sentence ?? ''}</Text>
            <Button key="add-retry" label={COPY.editAndRetry} variant="primary" onPress={() => update($, add, (value: PaneAdd): PaneAdd => ({ ...value, phase: 'form' }))} />
            <Button key="back" label={COPY.back} onPress={() => update($, view, (): PaneView => ({ screen: 'queue' }))} />
          </Box>
        )
      }

      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>{COPY.newTask}</Text>
          {'Input' in elements && (
            <elements.Input key="add-title" label={COPY.whatToDo} value={form.title} onInput={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, title: value }))} onSubmit={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, title: value }))} />
          )}
          {'Input' in elements && (
            <elements.Input key="add-criteria" label={COPY.criteria} placeholder={COPY.criteriaPlaceholder} value={form.criteria} onInput={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, criteria: value }))} onSubmit={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, criteria: value }))} />
          )}
          {'Select' in elements && form.goals.length > 0 && (
            <elements.Select key="add-goal" label={COPY.goal} value={form.goal} options={form.goals} onSelect={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, goal: value }))} />
          )}
          {form.goals.length === 0 && <Text color="warning">{COPY.noGoal}</Text>}
          {'Select' in elements && (
            <elements.Select key="add-after" label={COPY.afterLabel} value={form.after} options={form.stories} onSelect={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, after: value }))} />
          )}
          <Text dimColor>{COPY.quickTaskNote}</Text>
          <Box flexDirection="row" gap={1}>
            <Button key="add-cancel" label={COPY.cancel} onPress={() => update($, view, (): PaneView => ({ screen: 'queue' }))} />
            <Button key="add-send" label={COPY.handOver} variant="primary" onPress={() => sendTask($)} />
          </Box>
        </Box>
      )
    }

    // THE QUEUE: waiting for you, running, queued or held, done today.
    const stale = isStale ? COPY.stale : ''
    const isEmpty = current.waiting.length + current.running.length + current.queued.length + current.doneToday.length === 0

    return (
      <Box flexDirection="column" gap={1}>
        {top}
        {isStale && <Text color="warning">{COPY.unreachable(current.fetchedAt === null ? '?' : clock(new Date(current.fetchedAt).toISOString(), offset) ?? '?')}</Text>}
        {current.header !== '' && <Text dimColor>{current.header}</Text>}
        {current.paused !== null && (
          <Box key="paused" flexDirection="column">
            <Text color="warning">{current.paused}</Text>
            <Link href={consoleLink(base, 'work')} label={COPY.resumeInConsole} />
          </Box>
        )}
        {isEmpty && !isStale && (
          <Box key="empty" flexDirection="column">
            <Text bold>{COPY.emptyTitle}</Text>
            <Text dimColor>{COPY.emptyHint}</Text>
          </Box>
        )}
        {current.waiting.length > 0 && (
          <Box key="waiting" flexDirection="column">
            <Text color="warning">{`${COPY.waiting} · ${current.waiting.length}${stale}`}</Text>
            {current.waiting.map(item => (
              <Box key={item.key} flexDirection="column">
                <Text bold>{item.title}</Text>
                <Box flexDirection="row" gap={1}>
                  <Text dimColor>{item.detail}</Text>
                  <Link href={item.console} label={COPY.inConsole} />
                </Box>
              </Box>
            ))}
          </Box>
        )}
        {current.running.length > 0 && (
          <Box key="running" flexDirection="column">
            <Text dimColor>{`${COPY.running} · ${current.running.length}${stale}`}</Text>
            {current.running.map(item => (
              <Button key={`story-${item.story}`} plain onPress={() => openStory($, item.story)}>
                {item.title} <Text dimColor>{item.detail}</Text> <Text color={item.isStuck ? 'warning' : 'suggestion'}>{bar(item.fraction)}</Text>
              </Button>
            ))}
          </Box>
        )}
        {current.queued.length > 0 && (
          <Box key="queued" flexDirection="column">
            <Text dimColor>{`${COPY.queued} · ${current.queued.length}${stale}`}</Text>
            {current.queued.map(item => (
              <Text key={`queued-${item.story}`}>
                {item.title} <Text color={item.isHeld ? 'warning' : undefined} dimColor={!item.isHeld}>{item.detail}</Text>
              </Text>
            ))}
          </Box>
        )}
        {current.doneToday.length > 0 && (
          <Box key="done" flexDirection="column">
            <Text dimColor>{`${COPY.doneToday} · ${current.doneToday.length}`}</Text>
            {current.doneToday.map(item => (
              <Text key={`done-${item.story}`} dimColor>
                {item.title} · {item.detail}
              </Text>
            ))}
          </Box>
        )}
        {isStale && <Text dimColor>{COPY.addAfterReconnect}</Text>}
        {!isStale && hasInput && 'Input' in elements && (
          <Box key="quick" flexDirection="row" gap={1}>
            <elements.Input key="quick-add" label={COPY.quickAdd} placeholder={COPY.quickPlaceholder} value={await read($, quick)} onInput={value => update($, quick, (): string => value)} onSubmit={async value => { await update($, quick, (): string => ''); await openAdd($, value) }} />
            <Button key="quick-open" label={COPY.quickAdd} onPress={async () => { const value = await read($, quick); await update($, quick, (): string => ''); await openAdd($, value) }} />
          </Box>
        )}
        {!isStale && !hasInput && (
          <Box key="phone-add" flexDirection="column">
            <Button key="phone-add" label={COPY.addOnPhone} onPress={() => $.prompt.submit({ text: COPY.addOnPhonePrompt })} />
            <Text dimColor>{COPY.addOnPhoneNote}</Text>
          </Box>
        )}
      </Box>
    )
  })
}
