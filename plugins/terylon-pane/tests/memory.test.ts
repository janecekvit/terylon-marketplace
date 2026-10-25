import { test, expect } from 'claude-code/testing'

import { GATES, PANE_PROPS, SESSION, exact, world } from './fixtures'

const MEMORY_MOUNT = { plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

test("the Memory tab shows the leader's memory as stored, a card per file, and the proposals waiting to be confirmed here", async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const memory = await $.ui.mount(MEMORY_MOUNT)
  await memory.press({ key: 'tab-memory' })

  expect(await memory.find({ type: 'Text', text: exact('About you') })).toBeDefined()
  expect((await memory.find({ type: 'Text', text: exact('owner · 2 entries') }))?.props.color).toBe('subtle')
  expect(await memory.find({ type: 'Text', text: exact('Píše česky; kód anglicky.') })).toBeDefined()
  expect(await memory.find({ type: 'Text', text: exact('terylon/deploy') })).toBeDefined()
  expect(await memory.find({ type: 'Text', text: exact('topic · note') })).toBeDefined()
  expect((await memory.find({ type: 'Text', text: exact('what the leader remembers across runs') }))?.props.color).toBe('subtle')

  // THE PROPOSALS WAIT HERE (S27): confirmed or dropped on the Memory tab, the console's memory browser a link away.
  expect(await memory.find({ type: 'Text', text: exact('Proposals waiting · 1') })).toBeDefined()
  expect((await memory.find({ type: 'Text', text: exact('+ Merge zůstává za passkey.') }))?.props.color).toBe('success')
  expect((await memory.find({ key: 'act-proposal-5-confirm' }))?.props.label).toBe('Confirm')
  expect(await memory.find({ type: 'Link', text: 'Confirm in the console ↗' })).toBeUndefined()
  expect((await memory.find({ type: 'Link', text: "Versions, roll-back and dropped proposals stay in the console's memory browser ↗" }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=memory')
  expect(await memory.find({ type: 'Text', text: exact('Proposed in this session') })).toBeDefined()
  expect(await memory.find({ type: 'Text', text: exact('Nothing yet.') })).toBeDefined()
  expect(await memory.find({ type: 'Text', text: exact('/terylon-pane · /terylon-memory') })).toBeDefined()

  const cards = (await memory.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'round')
  expect(cards.length).toBeGreaterThanOrEqual(3)
})

test('memory entries stay in the language they were stored in, English included', async ($, on) => {
  const terylon = world(on)
  terylon.answers.memory_get = { files: [{ file: 'owner', kind: 'owner', entries: ['Writes Czech; code in English.'] }], proposals: [] }
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await $.command.run({ command: 'terylon-memory', args: '' } as never).catch(() => undefined)

  const memory = await $.ui.mount(MEMORY_MOUNT)
  expect(await memory.find({ type: 'Text', text: exact('Writes Czech; code in English.') })).toBeDefined()
  expect(await memory.find({ type: 'Text', text: exact('owner · 1 entry') })).toBeDefined()
})

test('a topic opens in place; its first line until pressed', async ($, on) => {
  const terylon = world(on)
  terylon.answers.memory_get = { files: [{ file: 'topic:terylon/deploy', kind: 'topic', text: 'First line.\nSecond line.' }], proposals: [] }
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await $.command.run({ command: 'terylon-memory', args: '' } as never).catch(() => undefined)

  const memory = await $.ui.mount(MEMORY_MOUNT)
  expect(await memory.find({ type: 'Text', text: exact('First line.') })).toBeDefined()
  await memory.press({ key: 'mem-topic-0' })
  expect(await memory.find({ type: 'Text', text: exact('First line.\nSecond line.') })).toBeDefined()
})

test('an edit is a proposal: memory_propose with the old and new text and why, then a link to confirm it in the console', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await $.command.run({ command: 'terylon-memory', args: '' } as never).catch(() => undefined)

  const memory = await $.ui.mount(MEMORY_MOUNT)
  await memory.press({ key: 'mem-edit-0-0' })

  const selected = await memory.find({ key: 'mem-edit-0-0' })
  expect(selected?.props.label).toBe('● Edit')
  expect(selected?.props.variant).toBe('primary')
  expect((await memory.find({ key: 'mem-edit-0-1' }))?.props.dimColor).toBe(true)
  expect((await memory.find({ type: 'Text', text: exact('The memory changes only after you confirm the proposal.') }))?.props.color).toBe('inactive')

  await memory.input({ key: 'mem-text', text: 'Píše česky; kód, commity a dokumenty anglicky.', kind: 'change' })
  await memory.input({ key: 'mem-why', text: 'Upřesnění z #332', kind: 'change' })
  await memory.press({ key: 'mem-propose' })

  const proposed = terylon.calls.filter(call => call.tool === 'memory_propose')
  expect(proposed).toHaveLength(1)
  expect(proposed[0]?.args).toEqual({ action: 'replace', file: 'owner', text: 'Píše česky; kód, commity a dokumenty anglicky.', oldText: 'Píše česky; kód anglicky.', why: 'Upřesnění z #332' })
  expect((await memory.find({ type: 'Text', text: exact('The proposal waits for your confirmation under Proposals waiting; the memory changes only after it.') }))?.props.color).toBe('success')
  expect(await memory.find({ type: 'Text', text: exact('Edit · owner · Píše česky; kód, commity a dokumenty anglicky.') })).toBeDefined()

  // Nothing the pane can press confirms it: the confirmation is the console's memory gate.
  expect(terylon.calls.map(call => call.tool).filter(tool => GATES.includes(tool) || /confirm|memory_(edit|write|rollback)/.test(tool))).toEqual([])
})

test('a removal proposes remove with the old text; a refusal is shown in the gate\'s own words', async ($, on) => {
  const terylon = world(on)
  terylon.answers.memory_propose = undefined
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await $.command.run({ command: 'terylon-memory', args: '' } as never).catch(() => undefined)

  const memory = await $.ui.mount(MEMORY_MOUNT)
  await memory.press({ key: 'mem-remove-0-1' })
  await memory.input({ key: 'mem-why', text: 'Zastaralé', kind: 'change' })
  await memory.press({ key: 'mem-propose' })

  expect(terylon.calls.filter(call => call.tool === 'memory_propose')[0]?.args).toEqual({ action: 'remove', file: 'owner', oldText: 'Merge potvrzuje passkey.', why: 'Zastaralé' })
  expect((await memory.find({ type: 'Text', text: exact('no such tool memory_propose') }))?.props.color).toBe('error')
})

test('the rules the machine enforces: each one line with who enforces it, pressed for its artefact', async ($, on) => {
  const terylon = world(on)
  terylon.answers.memory_get = {
    files: [],
    proposals: [],
    rules: [
      { rule: 'No push to main and no force push.', enforcedBy: 'a hook', artefact: '.claude/hooks/git-guard.js' },
      { rule: 'Only the owner approves a plan, merges or changes the memory.', enforcedBy: 'the control plane', artefact: 'src/Terylon.Web.Host/LeaderEndpoints.cs' },
    ],
  }
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await $.command.run({ command: 'terylon-memory', args: '' } as never)

  for (const surface of ['desktop', 'terminal'] as const) {
    const memory = await $.ui.mount({ ...MEMORY_MOUNT, surface })

    expect(await memory.find({ type: 'Text', text: exact('Rules the machine enforces') })).toBeDefined()
    expect((await memory.find({ key: 'mem-rule-0' }))?.text).toBe('No push to main and no force push.  a hook')
    expect((await memory.find({ type: 'Text', text: exact('a hook') }))?.props.color).toBe('subtle')
    expect((await memory.find({ type: 'Text', text: exact('No push to main and no force push.') }))?.props.wrap).toBe('truncate-end')
    expect(await memory.find({ type: 'Text', text: /git-guard\.js/ })).toBeUndefined()

    await memory.press({ key: 'mem-rule-0' })
    expect(await memory.find({ type: 'Text', text: /\.claude\/hooks\/git-guard\.js/ })).toBeDefined()
    await memory.press({ key: 'mem-rule-0' })

    // An empty memory is said quietly, never left blank.
    expect((await memory.find({ type: 'Text', text: exact('Nothing remembered yet.') }))?.props.color).toBe('subtle')
    await memory.unmount()
  }
})
