import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { calculateDataSufficiency, normaliseDemoPatient, selectDemoPatient } from './demoPatientModel.js'

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))

test('normalises fixture values without turning unknown observations into zero', async () => {
  const ava = normaliseDemoPatient(await fixture('ava'), 'Ava Chen')
  assert.equal(ava.profile.cycleLengthEstimate, 28)
  assert.equal(ava.dailyLogs[4].breastTenderness, null)
  assert.notEqual(ava.dailyLogs[4].breastTenderness, 0)
})

test('data sufficiency preserves the specification Level 2 requirement', async () => {
  const ava = normaliseDemoPatient(await fixture('ava'), 'Ava Chen')
  const mei = normaliseDemoPatient(await fixture('mei'), 'Mei Lin')
  const sofia = normaliseDemoPatient(await fixture('sofia'), 'Sofia R.')
  assert.deepEqual([ava, mei, sofia].map((patient) => patient.dataSufficiency.level), [1, 1, 1])
  assert.equal(calculateDataSufficiency({ cycles: [{ isComplete: true }, { isComplete: true }, { isComplete: true }], episodes: Array(6), dailyLogs: [] }).level, 2)
})

test('fixture identities are independently loadable for dashboard switching', async () => {
  const patients = await Promise.all(['ava', 'mei', 'sofia'].map(async (name) => normaliseDemoPatient(await fixture(name), name)))
  assert.deepEqual(patients.map((patient) => patient.id), ['usr_ava', 'usr_mei', 'usr_sofia'])
  assert.equal(selectDemoPatient(patients, 'usr_mei').name, 'mei')
  assert.equal(selectDemoPatient(patients, 'missing').id, 'usr_ava')
})
