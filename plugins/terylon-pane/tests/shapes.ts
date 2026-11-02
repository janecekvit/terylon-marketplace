// WHAT A TERYLON WITH REFS ANSWERS (Terylon S66): shapes read from a pull request's environment, read only, and trimmed
// to the fields the pane draws. Every subject carries its ref and GUID beside the number it had; a story names its goal
// by `goalRef`, its work item as {number, url}, and on the setup token `costKnown: false` with its `tokens`.

import { BRIEFING, FLIGHT, GOAL_3, PLANS, STORIES, STORY_327, STORY_333 } from './fixtures'

// A list story merged on the setup token, as /api/stories/S-761RY answered it: no cost, its tokens measured.
export const LIVE_STORY = {
  id: 120,
  goal: 86,
  title: 'one word',
  state: 'merged',
  target: 'list',
  workItem: null,
  workItemUrl: null,
  run: 'story-pr-284-120',
  pullRequest: null,
  source: 'owner',
  attempt: 1,
  startedAt: '2026-11-02T03:31:32.1332393+00:00',
  updatedAt: '2026-11-02T03:31:38.3270734+00:00',
  costUsd: null,
  costKnown: false,
  tokens: 22367,
  budgetUsd: 25,
  hours: 6,
  number: 120,
  ref: 'S-761RY',
  guid: '01a19a4f-c9e4-76aa-948d-66fcca73071e',
  goalRef: 'G-TA1AQ',
  criteria: ['The answer is the word ALPHA.'],
  timeline: [],
}

// Its plan and its goal, as /api/plans and /api/goals?closed=true answered them.
export const LIVE_PLAN = { id: 2252, goal: 86, goalTitle: 'mcp-proof accept 1793590281779', target: 'list', source: 'owner', state: 'approved', estimateUsd: 0, repeating: null, number: 2252, ref: 'P-RDJVS', guid: '01a19a4f-c9e3-752d-95a7-0debbb86cb79', goalRef: 'G-TA1AQ' }

export const LIVE_GOAL = { id: 86, title: 'mcp-proof accept 1793590281779', priority: 2, state: 'dropped', target: 'list', source: 'mcp:mcp-proof', stories: { merged: 1 }, number: 86, ref: 'G-TA1AQ', guid: '01a19a4f-c9e2-7b96-8e68-60fbcda50557' }

// THE FIXTURES' WORLD WITH REFS: the same stories, goals and plans, each carrying the ref a Terylon of S66 gives it.
export const REFS = { 333: 'S-BD6XS', 329: 'S-73PBR', 327: 'S-C7Y32', 328: 'S-01234', 347: 'S-MNPQR', 341: 'S-HTMX6', 3: 'G-GQGTA', 41: 'P-Y46G7' } as const

const WORK_ITEM = { number: 481, url: 'https://dev.example/wi/481' }

export const REF_BRIEFING = {
  ...BRIEFING,
  questionsOpen: BRIEFING.questionsOpen.map(question => ({ ...question, about: REFS[333], subjectRef: REFS[333] })),
  plansWaiting: BRIEFING.plansWaiting.map(plan => ({ ...plan, ref: REFS[41], goalRef: REFS[3] })),
  storiesVerified: BRIEFING.storiesVerified.map(story => ({ ...story, ref: REFS[327], goalRef: REFS[3], workItem: WORK_ITEM })),
}

export const REF_FLIGHT = {
  ...FLIGHT,
  stories: FLIGHT.stories.map(story => ({ ...story, ref: REFS[story.id as 333 | 329], goalRef: REFS[3] })),
}

export const REF_STORIES = {
  stories: STORIES.stories.map(story => ({ ...story, ref: REFS[story.id as 333 | 329 | 328 | 347 | 341], goalRef: REFS[3] })),
}

export const REF_STORY_327 = { ...STORY_327, ref: REFS[327], goalRef: REFS[3], workItem: WORK_ITEM }

export const REF_STORY_333 = { ...STORY_333, ref: REFS[333], goalRef: REFS[3] }

export const REF_GOAL_3 = { ...GOAL_3, ref: REFS[3], storyList: GOAL_3.storyList.map(story => ({ ...story, ref: REFS[story.id as 333 | 329] })) }

export const REF_PLANS = { plans: PLANS.plans.map(plan => ({ ...plan, ref: REFS[41], goalRef: REFS[3] })) }

// THE SAME WORLD ON THE SETUP TOKEN: the briefing says its basis, and every running story says its cost is not known.
export const SETUP_BRIEFING = { ...REF_BRIEFING, costBasis: 'setup-token' }

export const SETUP_FLIGHT = {
  ...REF_FLIGHT,
  stories: REF_FLIGHT.stories.map(story => ({ ...story, costUsd: 0, costKnown: false, tokens: story.id === 333 ? 48033 : 18000 })),
}

export const SETUP_STORIES = {
  stories: REF_STORIES.stories.map(story => ({ ...story, costKnown: false, tokens: 66000, costUsd: 0 })),
}
