import { test, expect } from 'claude-code/testing'

import { GATES, PANE_PROPS, SESSION, world } from './fixtures'

const MEMORY_MOUNT = { plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon-memory', props: PANE_PROPS } as const

test("the memory pane shows the leader's current memory and the proposals waiting in the console", async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const pane = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
  await pane.press({ key: 'open-memory' })
  const memory = await $.ui.mount(MEMORY_MOUNT)

  expect(await memory.find({ type: 'Text', text: 'owner' })).toBeDefined()
  expect(await memory.find({ type: 'Text', text: 'Píše česky; kód anglicky.' })).toBeDefined()
  expect(await memory.find({ type: 'Text', text: 'topic:terylon/deploy' })).toBeDefined()
  expect((await memory.find({ type: 'Link', text: '1 návrhů čeká na tvé potvrzení v konzoli' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=memory')
})

test('an edit is a proposal: memory_propose with the old and new text and why, then a link to confirm it in the console', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await $.command.run({ command: 'terylon-memory', args: '' } as never).catch(() => undefined)

  const memory = await $.ui.mount(MEMORY_MOUNT)
  await memory.press({ key: 'mem-edit-0-0' })
  await memory.input({ key: 'mem-text', text: 'Píše česky; kód, commity a dokumenty anglicky.', kind: 'change' })
  await memory.input({ key: 'mem-why', text: 'Upřesnění z #332', kind: 'change' })
  await memory.press({ key: 'mem-propose' })

  const proposed = terylon.calls.filter(call => call.tool === 'memory_propose')
  expect(proposed).toHaveLength(1)
  expect(proposed[0]?.args).toEqual({ action: 'replace', file: 'owner', text: 'Píše česky; kód, commity a dokumenty anglicky.', oldText: 'Píše česky; kód anglicky.', why: 'Upřesnění z #332' })
  expect(await memory.find({ type: 'Text', text: 'Návrh čeká na tvé potvrzení v konzoli; paměť se změní až po něm.' })).toBeDefined()
  expect((await memory.find({ type: 'Link', text: 'Potvrdit v konzoli ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=memory')

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
  expect(await memory.find({ type: 'Text', text: 'no such tool memory_propose' })).toBeDefined()
})
