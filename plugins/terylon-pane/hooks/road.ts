// THE GOAL'S ROAD: Terylon sends no stage for a goal, so the pane derives it here from what it already reads. Pure: no
// $, so a test reads it without a session. The first that holds decides:
//
//   the goal is closed ─────────────────────────────▶ Done
//   a story waits for its merge or its acceptance ──▶ Your merge, or Your accept where each such story is a list story
//   a plan waits for the owner's approval ──────────▶ Approve
//   a story is being verified ──────────────────────▶ Verify
//   a story has started or is queued ───────────────▶ Build
//   otherwise ──────────────────────────────────────▶ Plan
//
// A repeating task's goal has no road: its card says its newest run in words.

import type { PaneGoalCard, PaneGoalItem, PanePhase, PanePlan, PaneQuestionItem, PaneRoad, PaneRoadPlan, PaneRoadStage, PaneRoadStep, PaneRoadStory, PaneRunningItem, PaneStory, PaneWaitingItem } from '../types'

import { COPY } from './copy'
import { list, number, refOf, spentOf, text } from './queue'
import * as words from './words'

type Json = Record<string, unknown>

// The stages in the road's order; Approve and Your merge are the owner's gates.
export const ROAD_STAGES: readonly PaneRoadStage[] = ['plan', 'approve', 'build', 'verify', 'merge', 'done']

const GATES: ReadonlySet<PaneRoadStage> = new Set<PaneRoadStage>(['approve', 'merge'])

// The states of a goal still in play; every other state is closed.
const OPEN_GOAL_STATES: ReadonlySet<string> = new Set(['open', 'active', 'planned'])

// A STORY THAT HAS STARTED AND NOT ENDED, OR WAITS FOR A SLOT, is the goal being built: blocked and a pull request open
// have started, and a blocked story's goal is not back to planning.
const BUILDING_STATES: ReadonlySet<string> = new Set(['approved', 'dispatched', 'running', 'pr-open', 'blocked'])

const QUEUED_STATES: ReadonlySet<string> = new Set(['approved'])

// The states a goal's "n of m stories" leaves out: what is not yet the goal's work, and what no longer is.
const UNCOUNTED_STATES: ReadonlySet<string> = new Set(['proposed', 'abandoned'])

const DONE_STATES: ReadonlySet<string> = new Set(['merged', 'accepted'])

export function isClosedGoal(state: string | undefined): boolean {
  return !OPEN_GOAL_STATES.has(state ?? '')
}

export function stageOf(input: { isClosed: boolean; stories: readonly { state: string }[]; plans: readonly { isProposed: boolean }[] }): PaneRoadStage {
  if (input.isClosed) {
    return 'done'
  }

  if (input.stories.some(story => story.state === 'verified')) {
    return 'merge'
  }

  if (input.plans.some(plan => plan.isProposed)) {
    return 'approve'
  }

  if (input.stories.some(story => story.state === 'verifying')) {
    return 'verify'
  }

  return input.stories.some(story => BUILDING_STATES.has(story.state)) ? 'build' : 'plan'
}

// WHETHER THE GATE IS AN ACCEPTANCE: a list story is accepted, never merged. While nothing is verified yet, the goal's
// own target says which gate is ahead.
export function isAcceptGate(stories: readonly { state: string; isList: boolean }[], target: string | null | undefined): boolean {
  const verified = stories.filter(story => story.state === 'verified')

  return verified.length > 0 ? verified.every(story => story.isList) : target === 'list'
}

export function roadSteps(stage: PaneRoadStage, isAccept: boolean): PaneRoadStep[] {
  const at = ROAD_STAGES.indexOf(stage)

  return ROAD_STAGES.map((name, index) => ({
    name: name === 'merge' && isAccept ? COPY.road.accept : COPY.road[name],
    status: stage === 'done' || index < at ? 'done' : index === at ? 'now' : 'next',
    isGate: GATES.has(name),
  }))
}

function nextOf(stage: PaneRoadStage, isAccept: boolean, stories: readonly PaneRoadStory[], hasQuestion: boolean): string {
  switch (stage) {
    case 'done':
      return COPY.nextDone
    case 'merge':
      return isAccept ? COPY.nextAccept : COPY.nextMerge
    case 'approve':
      return COPY.nextApprove
    default:
  }

  if (hasQuestion) {
    return COPY.nextAsks
  }

  if (stories.some(story => story.isStuck)) {
    return COPY.nextStuck
  }

  if (stories.some(story => story.state === 'blocked')) {
    return COPY.nextBlocked
  }

  if (stage === 'verify') {
    return COPY.nextVerify
  }

  if (stage === 'build') {
    return stories.every(story => !BUILDING_STATES.has(story.state) || QUEUED_STATES.has(story.state)) ? COPY.nextQueued : COPY.nextBuild
  }

  return COPY.nextPlan
}

export function roadOf(input: { isClosed: boolean; target?: string | null; stories: readonly PaneRoadStory[]; plans: readonly { isProposed: boolean }[]; hasQuestion: boolean }): PaneRoad {
  const stage = stageOf(input)
  const isAccept = isAcceptGate(input.stories, input.target)
  const steps = roadSteps(stage, isAccept)

  return {
    stage,
    word: steps[ROAD_STAGES.indexOf(stage)]?.name ?? '',
    tone: GATES.has(stage) ? 'merged' : stage === 'done' ? 'success' : 'suggestion',
    steps,
    next: nextOf(stage, isAccept, input.stories, input.hasQuestion),
  }
}

// A story's phases as a road's steps: its gate is the last of them, its merge or its acceptance.
export function phaseSteps(phases: readonly PanePhase[], names: readonly string[]): PaneRoadStep[] {
  return phases.map((phase, index) => ({ name: names[index] ?? phase.label, status: phase.status, isGate: index === phases.length - 1 }))
}

// WHAT NEXT, FOR A STORY NO RUN IS WORKING ON: what it waits for, or nothing for one that ended.
export function storyNext(story: Pick<PaneStory, 'state' | 'isList' | 'heldReason'>): string | null {
  switch (story.state) {
    case 'verified':
      return story.isList ? COPY.nextAccept : COPY.nextMerge
    case 'blocked':
      return COPY.nextBlocked
    case 'approved':
      return story.heldReason ?? COPY.nextQueued
    case 'proposed':
      return COPY.nextApprove
    case 'verifying':
    case 'pr-open':
      return COPY.nextVerify
    default:
      return null
  }
}

// WHERE A STORY IS KEPT: its target says so; with none named, a verified story with no pull request is a list story.
function isListOf(story: Json): boolean {
  const target = text(story.target)

  return target !== null ? target === 'list' : story.state === 'verified' && (story.pullRequest ?? null) === null
}

// A value of one answer laid over another's where it names one: a field left null by the fresher answer stays known.
function layered(...answers: readonly (Json | undefined)[]): Json {
  const merged: Json = {}

  for (const answer of answers) {
    for (const [key, value] of Object.entries(answer ?? {})) {
      if (value !== null && value !== undefined) {
        merged[key] = value
      }
    }
  }

  return merged
}

// EVERY STORY THE LAST READ KNOWS, one each: stories_list's, then the briefing's verified, then work_in_flight's, the
// fresher answer over the older. `stateNow` lays an act the owner just took over a read that lags.
export function roadStoriesOf(stories: readonly Json[], flight: Json, briefing: Json, basis: string | null, stateNow: (id: number, state: string) => string = (_, state) => state): PaneRoadStory[] {
  const flying = list(flight.stories)
  const verified = list(briefing.storiesVerified).map(story => ({ ...story, state: 'verified' }))
  const ids = new Set([...stories, ...verified, ...flying].map(story => number(story.id)).filter((id): id is number => id !== null))

  return [...ids].map(id => {
    const whole = layered(stories.find(story => number(story.id) === id), verified.find(story => number(story.id) === id), flying.find(story => number(story.id) === id))
    const state = stateNow(id, String(whole.state ?? ''))
    const spent = spentOf(whole, basis)

    return {
      id,
      ref: refOf(whole, id),
      title: text(whole.title) ?? '',
      goal: number(whole.goal),
      goalRef: text(whole.goalRef),
      state,
      isList: isListOf({ ...whole, state }),
      isStuck: whole.stuck !== null && whole.stuck !== undefined,
      usd: spent.usd,
      tokens: spent.tokens,
      isCostKnown: spent.isKnown,
    }
  })
}

// The plans a road reads: plans_list's, then a plan waiting that the briefing names and plans_list has not yet read.
export function roadPlansOf(plans: readonly PanePlan[], waiting: readonly PaneWaitingItem[]): PaneRoadPlan[] {
  const read = plans.map(plan => ({ id: plan.id, ref: plan.ref ?? String(plan.id), goal: plan.goal, isProposed: plan.isProposed, stories: plan.stories.length, storyIds: plan.stories.map(story => story.id) }))
  const named = waiting
    .filter(item => item.kind === 'plan' && item.goal !== null && !read.some(plan => plan.id === item.target))
    .map(item => ({ id: item.target, ref: item.ref ?? String(item.target), goal: item.goal ?? 0, isProposed: true, stories: item.stories ?? 0, storyIds: [] }))

  return [...read, ...named]
}

// "2 of 3 stories", from goals_list's counts where it says them, else from the stories read.
function storiesDone(goal: PaneGoalItem, stories: readonly PaneRoadStory[]): string {
  const counted = goal.counts !== undefined && Object.keys(goal.counts).length > 0
    ? Object.entries(goal.counts)
    : Object.entries(stories.reduce<Record<string, number>>((counts, story) => ({ ...counts, [story.state]: (counts[story.state] ?? 0) + 1 }), {}))
  const all = counted.filter(([state]) => !UNCOUNTED_STATES.has(state)).reduce((sum, [, count]) => sum + count, 0)
  const done = counted.filter(([state]) => DONE_STATES.has(state)).reduce((sum, [, count]) => sum + count, 0)

  return all === 0 ? COPY.noGoalStories : COPY.storiesDone(done, all)
}

// WHAT A GOAL'S STORIES SPENT: its dollars where every cost is known, else its tokens, else that the cost is not known.
// Never a $ while it is not known, and nothing for a goal that has spent nothing.
export function goalSpend(stories: readonly PaneRoadStory[]): string | null {
  if (stories.length === 0) {
    return null
  }

  if (stories.some(story => !story.isCostKnown)) {
    const tokens = stories.reduce((sum, story) => sum + (story.tokens ?? 0), 0)

    return tokens > 0 ? words.tokens(tokens) : words.COST_NOT_KNOWN
  }

  const usd = stories.reduce((sum, story) => sum + story.usd, 0)

  return usd > 0 ? words.money(usd) : null
}

type GoalKey = { id: number; ref?: string | null }

// The open goal a story is under: by the number its answer names, by its goal's ref, or by the plan it stands in.
function goalIdOf(goals: readonly GoalKey[], plans: readonly PaneRoadPlan[], id: number, goal: number | null, goalRef: string | null): number | null {
  const found = goals.find(item => item.id === goal) ?? goals.find(item => goalRef !== null && item.ref === goalRef) ?? goals.find(item => plans.some(plan => plan.goal === item.id && plan.storyIds.includes(id)))

  return found?.id ?? null
}

// THE OVERVIEW'S GOAL CARDS, and every running story no open goal could be found for, so that nothing running is ever
// hidden: until the goals are read, that is all of them.
export function goalCardsOf(input: { goals: readonly PaneGoalItem[]; plans: readonly PaneRoadPlan[]; stories: readonly PaneRoadStory[]; running: readonly PaneRunningItem[]; questions: readonly PaneQuestionItem[] }): { cards: PaneGoalCard[]; elsewhere: PaneRunningItem[] } {
  const storyOf = (id: number) => input.stories.find(story => story.id === id)
  const goalOfRunning = (item: PaneRunningItem) => goalIdOf(input.goals, input.plans, item.story, item.goal ?? storyOf(item.story)?.goal ?? null, item.goalRef ?? storyOf(item.story)?.goalRef ?? null)
  const cards = input.goals.map((goal): PaneGoalCard => {
    const stories = input.stories.filter(story => goalIdOf([goal], input.plans, story.id, story.goal, story.goalRef) === goal.id)
    const plans = input.plans.filter(plan => plan.goal === goal.id)
    const waitingPlan = plans.find(plan => plan.isProposed)
    const running = input.running.filter(item => goalOfRunning(item) === goal.id)
    const hasQuestion = input.questions.some(question => question.subject === `goal/${goal.id}` || stories.some(story => question.subject === `story/${story.id}`))
    const stuck = running.filter(item => item.isStuck).length

    if (goal.repeating !== undefined && goal.repeating !== null) {
      return { goal, road: null, summary: goal.repeating.run, spend: null, next: goal.repeating.terms, running, stuck }
    }

    const road = roadOf({ isClosed: isClosedGoal(goal.state), target: goal.target, stories, plans, hasQuestion })

    return {
      goal,
      road,
      summary: road.stage === 'approve' && waitingPlan !== undefined ? COPY.planOnRoad(waitingPlan.ref, waitingPlan.stories) : storiesDone(goal, stories),
      spend: goalSpend(stories),
      next: road.next,
      running,
      stuck,
    }
  })

  return { cards, elsewhere: input.running.filter(item => goalOfRunning(item) === null) }
}

// A GOAL'S NEWEST RUN IN WORDS, for its card on the overview: "today 05:00 · green · accepted", from what repeatingOf
// read of goals_list's `repeating`.
export function repeatingWords(repeating: { summary: string; runs: readonly { day: string; state: string }[] }): { run: string; terms: string } {
  const [newest] = repeating.runs

  return { run: newest === undefined ? COPY.repeatingNoRun : `${newest.day} · ${newest.state}`, terms: repeating.summary }
}
