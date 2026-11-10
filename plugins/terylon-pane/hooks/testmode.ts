// TEST MODE: /terylon-cockpit test puts a made-up Terylon behind the pane for this session alone. callTerylon answers
// every call from here before any $.mcp.call, so a walk of every screen and every act reaches nothing real. One goal
// per stage of the road, a stuck story, a question, a plan, stories waiting for their merge and their acceptance,
// notices, memory and metrics, each moment relative to the clock. An act moves this data, in memory, and says that
// nothing was sent. It covers the pane only: Claude's own Terylon tools in the same chat still reach the real Terylon.

import type { TerylonAnswer } from './terylon'

type Json = Record<string, unknown>

export type TestWorld = {
  goals: Json[]
  stories: Json[]
  plans: Json[]
  questions: Json[]
  notices: Json[]
  proposals: Json[]
  entries: string[]
  policy: Json
  paused: Json | null
  nextId: number
}

// The states a story's run goes in, as work_in_flight lists them.
const IN_FLIGHT: ReadonlySet<string> = new Set(['dispatched', 'running', 'pr-open', 'verifying'])

const ENDED: ReadonlySet<string> = new Set(['merged', 'accepted', 'abandoned'])

const NOTHING_SENT = 'Nothing was sent to Terylon.'

function said(what: string, extra: Json = {}): TerylonAnswer {
  return { kind: 'ok', value: { accepted: true, sentence: `Test mode: ${what} ${NOTHING_SENT}`, commandId: 'test-mode', subjectId: null, ...extra } }
}

export function createTestWorld(now: number): TestWorld {
  const ago = (minutes: number): string => new Date(now - minutes * 60000).toISOString()
  const story = (id: number, ref: string, goal: number, goalRef: string, title: string, state: string, extra: Json = {}): Json => ({
    id, ref, goal, goalRef, title, state, source: 'owner', updatedAt: ago(12), costUsd: 0, costKnown: false, tokens: 48000, after: [], ...extra,
  })
  const goal = (id: number, ref: string, title: string, priority: number, target: string, state = 'open', extra: Json = {}): Json => ({
    id, ref, title, priority, state, target, ask: `${title}: what the owner asked for, in a sentence.`, specification: null, decisions: [], repeating: null, ...extra,
  })
  const planned = [
    story(301, 'S-TEST1', 71, 'G-TAPPR', 'Read the bank export', 'proposed', { target: 'list' }),
    story(302, 'S-TEST2', 71, 'G-TAPPR', 'Sort into categories', 'proposed', { target: 'list' }),
    story(303, 'S-TEST3', 71, 'G-TAPPR', 'Write the monthly sheet', 'proposed', { target: 'list' }),
  ]

  return {
    goals: [
      goal(70, 'G-TPLAN', 'A goal still being planned', 3, 'list'),
      goal(71, 'G-TAPPR', 'Household budget', 2, 'list'),
      goal(72, 'G-TBULD', 'Take your time', 1, 'list'),
      goal(73, 'G-TVERI', 'Backups we can trust', 2, 'repository'),
      goal(74, 'G-TMERG', 'Slots fit the machine', 1, 'repository'),
      goal(75, 'G-TACPT', 'Morning digest', 3, 'list'),
      goal(76, 'G-TSTUK', 'Cleaner logs', 3, 'repository'),
      goal(77, 'G-TREPT', 'Daily statistics', 4, 'list', 'active', {
        repeating: { approved: { version: 1, title: 'Daily statistics', runBudgetUsd: 1, autoAccept: false }, waiting: null, paused: null, runs: [{ story: 209, state: 'verified', startedAt: ago(300), costUsd: null, costKnown: false, tokens: 21000, files: [] }] },
      }),
      goal(60, 'G-TDONE', 'An older goal', 4, 'list', 'done'),
    ],
    stories: [
      ...planned,
      story(201, 'S-TRUN1', 72, 'G-TBULD', 'Read the price columns', 'running', { target: 'list', tokens: 144000, startedAt: ago(36) }),
      story(202, 'S-TQUE1', 72, 'G-TBULD', 'Write the monthly total', 'approved', { target: 'list', after: [201] }),
      story(203, 'S-TVER1', 73, 'G-TVERI', 'Prove the backup restores', 'verifying', { startedAt: ago(50), pullRequest: { id: 352, url: 'https://example.invalid/pr/352', branch: 'feat/restore' } }),
      story(204, 'S-TMRG1', 74, 'G-TMERG', 'Slots fit the machine', 'verified', { startedAt: ago(90), pullRequest: { id: 353, url: 'https://example.invalid/pr/353', branch: 'feat/slots' } }),
      story(205, 'S-TACC1', 75, 'G-TACPT', 'Draft the morning digest', 'verified', { target: 'list', startedAt: ago(70) }),
      story(206, 'S-TSTK1', 76, 'G-TSTUK', 'Shorter log lines', 'running', { startedAt: ago(120), tokens: 88000, stuck: { since: ago(50), reason: 'The run has written nothing for 50 minutes.' } }),
      story(207, 'S-TBLK1', 76, 'G-TSTUK', 'Rotate the old logs', 'blocked', { blockedReason: 'It needs your choice of how long to keep them.', blockedFrom: ago(25), startedAt: ago(60) }),
      story(208, 'S-TDON1', 72, 'G-TBULD', 'Collect the sources', 'accepted', { target: 'list', updatedAt: ago(5) }),
      story(209, 'S-TRPT1', 77, 'G-TREPT', 'Daily statistics · run 1', 'verified', { target: 'list', source: 'routine', startedAt: ago(300) }),
    ],
    plans: [
      {
        id: 58, ref: 'P-TEST1', goal: 71, goalRef: 'G-TAPPR', goalTitle: 'Household budget', state: 'proposed', estimateUsd: 0, comment: null, repeating: null,
        stories: planned.map((item, index) => ({ id: item.id, ref: item.ref, title: item.title, criteria: ['A made-up criterion'], files: [], size: 'S', estimateUsd: null, runsAfter: index === 0 ? [] : [index], after: [] })),
      },
    ],
    questions: [{ id: 9, subject: 'story/201', subjectRef: 'S-TRUN1', goalRef: 'G-TBULD', about: 'S-TRUN1', text: 'Which of the two price columns is the one to add up?', askedAt: ago(4), answer: null }],
    notices: [
      { id: 3, source: 'host', key: 'test-host', title: 'A made-up notice that needs you', body: 'Test mode: nothing here is real.', raisedAt: ago(70), handledAt: null },
      { id: 4, source: 'leader', key: 'test-leader', title: 'The leader asks about Take your time', body: 'Test mode: nothing here is real.', raisedAt: ago(40), handledAt: null },
      { id: 5, source: 'production', key: 'test-production', title: 'Production is at b7d95c70', body: '', raisedAt: ago(30), handledAt: ago(30) },
      { id: 6, source: 'backup', key: 'test-backup', title: 'The backup ran', body: '', raisedAt: ago(200), handledAt: ago(200) },
    ],
    proposals: [{ id: 5, consolidates: null, operations: [{ action: 'add', file: 'owner', text: 'Merge stays in the console.', oldText: null }], suggestsRule: false, action: 'add', file: 'owner', text: 'Merge stays in the console.', oldText: null, why: 'A made-up reason.', judgement: 'story-run', by: 'brain', subject: 'story/204', subjectRef: 'S-TMRG1', at: ago(200) }],
    entries: ['Writes Czech; code in English.', 'A merge is made in the console, on the green commit.'],
    policy: { slots: 4, dayBudgetUsd: 20, version: 1, changedAt: null },
    paused: null,
    nextId: 400,
  }
}

function storiesOf(world: TestWorld, goal: unknown): Json[] {
  return world.stories.filter(item => item.goal === goal)
}

function goalAnswer(world: TestWorld, goal: Json): Json {
  const counts: Record<string, number> = {}

  for (const item of storiesOf(world, goal.id)) {
    counts[String(item.state)] = (counts[String(item.state)] ?? 0) + 1
  }

  return { ...goal, stories: counts, storyList: storiesOf(world, goal.id) }
}

function isOpenGoal(goal: Json): boolean {
  return goal.state === 'open' || goal.state === 'active' || goal.state === 'planned'
}

// A goal whose last story ended is done, and leaves the open goals.
function settleGoal(world: TestWorld, goalId: unknown): void {
  const goal = world.goals.find(item => item.id === goalId)
  const stories = storiesOf(world, goalId)

  if (goal !== undefined && goal.repeating === null && stories.length > 0 && stories.every(item => ENDED.has(String(item.state)))) {
    goal.state = 'done'
  }
}

function moveStory(world: TestWorld, id: unknown, state: string, extra: Json = {}): Json | undefined {
  const story = world.stories.find(item => item.id === id)

  if (story !== undefined) {
    Object.assign(story, { state, stuck: null, blockedReason: null, ...extra })
    settleGoal(world, story.goal)
  }

  return story
}

function flightStory(story: Json): Json {
  const stage = story.state === 'verifying' ? 'verify' : 'test'

  return { attempt: 1, budgetUsd: 8, hours: 6, stuck: null, environment: null, ...story, run: `test-${String(story.id)}`, progress: { stage, step: 4, steps: 6, current: 'a made-up step', agent: { name: 'tester', running: 1 }, tokens: story.tokens } }
}

function storyAnswer(story: Json, now: number): Json {
  const ago = (minutes: number): string => new Date(now - minutes * 60000).toISOString()
  const isVerified = story.state === 'verified'

  return {
    pullRequest: null,
    environment: null,
    ...story,
    progress: IN_FLIGHT.has(String(story.state)) ? flightStory(story).progress : isVerified ? { stage: 'merge', step: null, steps: null, current: null, agent: null, tokens: null } : null,
    criteria: ['A made-up criterion', 'Another made-up criterion'],
    verdict: null,
    verdicts: [],
    overrun: [],
    timeline: [
      { seq: 1, at: ago(40), type: 'StoryMoved', actor: 'leader', key: null, summary: 'approved → dispatched' },
      { seq: 2, at: ago(12), type: 'StoryMoved', actor: 'run', key: null, summary: `dispatched → ${String(story.state)}` },
    ],
  }
}

// What a call answers in test mode, as the answer of a Terylon: reads from the world, and an act moving it.
export function testAnswer(world: TestWorld, tool: string, args: Json, now: number): TerylonAnswer {
  const answer = (value: Json): TerylonAnswer => ({ kind: 'ok', value })

  switch (tool) {
    case 'briefing':
      return answer({
        costBasis: 'setup-token',
        plansWaiting: world.plans.filter(plan => plan.state === 'proposed').map(plan => ({ id: plan.id, ref: plan.ref, goal: plan.goal, goalRef: plan.goalRef, goalTitle: plan.goalTitle, stories: Array.isArray(plan.stories) ? plan.stories.length : 0, estimateUsd: plan.estimateUsd })),
        questionsOpen: world.questions,
        storiesVerified: world.stories.filter(item => item.state === 'verified' && item.source !== 'routine'),
        storiesBlocked: world.stories.filter(item => item.state === 'blocked'),
        leader: { paused: world.paused },
        unhandledNotices: world.notices.filter(item => item.handledAt === null).length,
      })
    case 'work_in_flight':
      return answer({ slots: 4, paused: world.paused !== null, costBasis: 'setup-token', stories: world.stories.filter(item => IN_FLIGHT.has(String(item.state))).map(flightStory) })
    case 'stories_list':
      return answer({ stories: world.stories })
    case 'goals_list':
      return answer({ goals: world.goals.filter(goal => isOpenGoal(goal) !== (args.closed === true)).map(goal => goalAnswer(world, goal)), closedCount: world.goals.filter(goal => !isOpenGoal(goal)).length })
    case 'goal_get': {
      const found = world.goals.find(goal => goal.id === args.goal)

      return found === undefined ? { kind: 'refused', status: 404, sentence: 'Test mode: no such goal.', console: null, value: {} } : answer(goalAnswer(world, found))
    }
    case 'plans_list':
      return answer({ plans: world.plans })
    case 'story_get': {
      const found = world.stories.find(item => item.id === args.story)

      return found === undefined ? { kind: 'refused', status: 404, sentence: 'Test mode: no such story.', console: null, value: {} } : answer(storyAnswer(found, now))
    }
    case 'notices_list':
      return answer({ unhandled: world.notices.filter(item => item.handledAt === null).length, notices: world.notices })
    case 'leader_status':
      return answer({ paused: world.paused })
    case 'policy_get':
      return answer(world.policy)
    case 'memory_get':
      return answer({ files: [{ file: 'owner', kind: 'owner', entries: world.entries }, { file: 'topic:terylon/deploy', kind: 'topic', text: 'A made-up note about deploys.' }], rules: [], proposals: world.proposals })
    case 'events_since':
      return answer({ events: [], since: args.since ?? 0, last: args.since ?? 0, more: false, head: args.since ?? 0, gap: false, reset: false })
    case 'plan_approve': {
      const plan = world.plans.find(item => item.id === args.plan)

      if (plan !== undefined) {
        plan.state = 'approved'
        storiesOf(world, plan.goal).filter(item => item.state === 'proposed').forEach(item => { item.state = 'approved' })
      }

      return said('approved here alone; its goal goes on to Build.')
    }
    case 'plan_rethink': {
      const plan = world.plans.find(item => item.id === args.plan)

      if (plan !== undefined) {
        plan.state = 'rethink'
      }

      return said('sent back here alone.')
    }
    case 'story_accept':
      moveStory(world, args.story, 'accepted', { updatedAt: new Date(now).toISOString() })

      return said('accepted here alone.')
    case 'story_return':
    case 'story_unblock':
      moveStory(world, args.story, 'running', { startedAt: new Date(now).toISOString() })

      return said('it runs again here alone.')
    case 'story_stop':
      moveStory(world, args.story, 'blocked', { blockedReason: 'stopped by you', blockedFrom: new Date(now).toISOString() })

      return said('stopped here alone.')
    case 'story_abandon':
      moveStory(world, args.story, 'abandoned')

      return said('abandoned here alone.')
    case 'question_answer':
      world.questions = world.questions.filter(item => item.id !== args.question)

      return said('your answer stays here.')
    case 'notice_handle': {
      const notice = world.notices.find(item => item.id === args.notice)

      if (notice !== undefined) {
        notice.handledAt = new Date(now).toISOString()
      }

      return said('marked handled here alone.', { notice: args.notice })
    }
    case 'memory_confirm': {
      const proposal = world.proposals.find(item => item.id === args.proposal)

      if (proposal !== undefined && typeof proposal.text === 'string') {
        world.entries = [...world.entries, proposal.text]
      }

      world.proposals = world.proposals.filter(item => item.id !== args.proposal)

      return said('confirmed here alone.')
    }
    case 'memory_drop':
      world.proposals = world.proposals.filter(item => item.id !== args.proposal)

      return said('dropped here alone.')
    case 'memory_propose': {
      world.nextId += 1
      world.proposals = [...world.proposals, { id: world.nextId, operations: [{ action: args.action, file: args.file, text: args.text ?? null, oldText: args.oldText ?? null }], action: args.action, file: args.file, text: args.text ?? null, oldText: args.oldText ?? null, why: args.why, by: 'web:you', at: new Date(now).toISOString() }]

      return said('proposed here alone.', { gate: 'pending' })
    }
    case 'goal_add': {
      world.nextId += 1
      world.goals = [{ id: world.nextId, ref: `G-T${world.nextId}`, title: args.title, ask: args.ask ?? null, priority: args.priority ?? 2, state: 'open', target: args.target ?? 'list', specification: null, decisions: [], repeating: null }, ...world.goals]

      return said('the goal is added here alone.', { subjectId: world.nextId })
    }
    case 'goal_drop': {
      const goal = world.goals.find(item => item.id === args.goal)

      if (goal !== undefined) {
        goal.state = 'dropped'
        storiesOf(world, goal.id).filter(item => !ENDED.has(String(item.state))).forEach(item => { item.state = 'abandoned' })
        world.plans.filter(plan => plan.goal === goal.id && plan.state === 'proposed').forEach(plan => { plan.state = 'withdrawn' })
        world.questions = world.questions.filter(item => !storiesOf(world, goal.id).some(story => item.subject === `story/${String(story.id)}`))
      }

      return said('dropped here alone.')
    }
    case 'tasks_add': {
      const goal = world.goals.find(item => item.id === args.goal)
      const tasks = Array.isArray(args.tasks) ? (args.tasks as Json[]) : []
      const planId = (world.nextId += 1)
      const stories = tasks.map(task => {
        world.nextId += 1

        return { id: world.nextId, ref: `S-T${world.nextId}`, goal: args.goal, goalRef: goal?.ref ?? null, title: task.title, state: 'proposed', source: 'owner', updatedAt: new Date(now).toISOString(), costUsd: 0, costKnown: false, tokens: null, after: [], target: goal?.target }
      })

      world.stories = [...world.stories, ...stories]
      world.plans = [...world.plans, { id: planId, ref: `P-T${planId}`, goal: args.goal, goalRef: goal?.ref ?? null, goalTitle: goal?.title ?? '', state: 'proposed', estimateUsd: 0, comment: null, repeating: null, stories: stories.map(item => ({ id: item.id, ref: item.ref, title: item.title, criteria: [], files: [], size: 'M', estimateUsd: null, runsAfter: [], after: [] })) }]

      return said('the task became a plan here alone.')
    }
    case 'leader_pause':
      world.paused = { at: new Date(now).toISOString(), source: 'cockpit', reason: typeof args.reason === 'string' ? args.reason : null }

      return said('paused here alone.')
    case 'leader_resume':
      world.paused = null

      return said('resumed here alone.')
    case 'policy_save':
      world.policy = { ...world.policy, ...args, version: Number(world.policy.version ?? 1) + 1, changedAt: new Date(now).toISOString() }

      return said('saved here alone.')
    default:
      return said('nothing happened.')
  }
}
