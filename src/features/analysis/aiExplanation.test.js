import test from 'node:test'
import assert from 'node:assert/strict'
import { AiExplanationError, explanationFacts, fetchAiExplanation } from './aiExplanation.js'

const response = ({ status = 200, contentType = 'application/json', body }) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': contentType }),
  text: async () => body,
})

test('selects only aggregate deterministic facts', () => {
  const result = {
    counts: { classified: 4, inWindow: 3, outsideWindow: 1, excluded: 2, classifications: [{ notes: 'do not send' }] },
    dataSufficiency: { completeCycles: 2, level: 1 },
  }
  assert.deepEqual(explanationFacts(result), { classifiedOnsets: 4, inWindowOnsets: 3, outsideWindowOnsets: 1, excludedOnsets: 2, completeCycles: 2, dataSufficiencyLevel: 1 })
})

test('client accepts only a marked valid explanation response', async () => {
  const fetchImpl = async () => response({ body: JSON.stringify({ source: 'tencent-adp', explanation: 'A sufficiently long and safe recorded-pattern explanation.' }) })
  assert.equal(await fetchAiExplanation({}, { fetchImpl }), 'A sufficiently long and safe recorded-pattern explanation.')
  await assert.rejects(fetchAiExplanation({}, { fetchImpl: async () => response({ body: JSON.stringify({ explanation: 'missing source marker and long enough' }) }) }), { category: 'INVALID_BACKEND_RESPONSE' })
})

test('client distinguishes a proxy non-JSON response from backend error categories', async () => {
  await assert.rejects(
    fetchAiExplanation({}, { fetchImpl: async () => response({ status: 502, contentType: 'text/plain', body: 'Bad Gateway' }) }),
    (error) => error instanceof AiExplanationError && error.category === 'INVALID_BACKEND_RESPONSE' && error.status === 502,
  )
  await assert.rejects(
    fetchAiExplanation({}, { fetchImpl: async () => response({ status: 422, body: JSON.stringify({ error: 'INVALID_OUTPUT', message: 'not exposed' }) }) }),
    (error) => error.category === 'INVALID_OUTPUT' && /safety checks/.test(error.message),
  )
  await assert.rejects(
    fetchAiExplanation({}, { fetchImpl: async () => response({ status: 502, body: JSON.stringify({ error: 'INVALID_STREAM' }) }) }),
    (error) => error.category === 'INVALID_STREAM' && /streaming response/.test(error.message),
  )
})

test('client classifies a failed HTTP connection separately', async () => {
  await assert.rejects(fetchAiExplanation({}, { fetchImpl: async () => { throw new TypeError('fetch failed') } }), { category: 'NETWORK_ERROR' })
})

test('client sends an entered demo password only as runtime Basic authentication', async () => {
  let requestOptions
  const fetchImpl = async (_url, options) => {
    requestOptions = options
    return response({ body: JSON.stringify({ source: 'tencent-adp', explanation: 'A sufficiently long and safe recorded-pattern explanation.' }) })
  }
  await fetchAiExplanation({}, { fetchImpl, demoPassword: 'runtime-only-password' })
  assert.equal(Buffer.from(requestOptions.headers.Authorization.slice(6), 'base64').toString('utf8'), 'careloop:runtime-only-password')
  assert.doesNotMatch(requestOptions.body, /runtime-only-password/)
})

test('client preserves fallback-friendly categories for access and 429 controls', async () => {
  for (const [status, category] of [[401, 'ACCESS_REQUIRED'], [429, 'RATE_LIMITED'], [429, 'CONCURRENCY_LIMIT'], [429, 'DAILY_LIMIT']]) {
    await assert.rejects(
      fetchAiExplanation({}, { fetchImpl: async () => response({ status, body: JSON.stringify({ error: category }) }) }),
      (error) => error.category === category && error.message.length > 20,
    )
  }
})


