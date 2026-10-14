import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createInsightsHandler } from './insightsHandler.js'
import { createInsightsSecurity, securityConfig } from './insightsSecurity.js'

const facts = { classifiedOnsets: 6, inWindowOnsets: 4, outsideWindowOnsets: 2, excludedOnsets: 1, completeCycles: 3, dataSufficiencyLevel: 2 }
const safeText = 'The recorded history shows 4 of 6 onsets in the five-day window and 2 outside it. This summary is not a diagnosis or medical advice.'

function requestFor(body, { ip = '127.0.0.1', authorization, raw = false } = {}) {
  const request = Readable.from([raw ? body : JSON.stringify(body)])
  request.method = 'POST'
  request.url = '/api/insights'
  request.headers = { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }
  request.socket = { remoteAddress: ip }
  return request
}

function captureResponse() {
  let resolve
  const completed = new Promise((done) => { resolve = done })
  const captured = { status: null, headers: null, body: '' }
  return {
    captured,
    completed,
    response: {
      writeHead(status, headers) { captured.status = status; captured.headers = headers },
      end(body) { captured.body = body; resolve() },
    },
  }
}

async function invoke(handler, body, options) {
  const target = captureResponse()
  await handler(requestFor(body, options), target.response)
  await target.completed
  return target.captured
}

const config = (overrides = {}) => ({ perIpPerHour: 20, maxConcurrent: 2, dailyLimit: 50, demoPassword: '', trustProxy: false, ...overrides })
const authorization = (password) => `Basic ${Buffer.from(`careloop:${password}`, 'utf8').toString('base64')}`
const successResponse = () => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'text/event-stream' }),
  body: Readable.from([`data: ${JSON.stringify({ Type: 'text.delta', Text: safeText })}\n\ndata: [DONE]\n\n`]),
})

test('backend always returns the JSON schema expected by React on success', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: Readable.from([`data: ${JSON.stringify({ Type: 'text.delta', Text: safeText })}\n\ndata: [DONE]\n\n`]),
  })
  const result = await invoke(createInsightsHandler({ appKey: 'secret', fetchImpl }), { facts })
  assert.equal(result.status, 200)
  assert.match(result.headers['Content-Type'], /^application\/json/)
  assert.deepEqual(JSON.parse(result.body), { explanation: safeText, source: 'tencent-adp' })
  assert.doesNotMatch(result.body, /secret/)
})

test('missing credentials and invalid ADP output are valid categorized JSON errors', async () => {
  const missing = await invoke(createInsightsHandler({ appKey: '' }), { facts })
  assert.equal(missing.status, 503)
  assert.equal(JSON.parse(missing.body).error, 'MISSING_CREDENTIALS')

  const fetchImpl = async () => ({ ok: true, status: 200, headers: new Headers(), body: Readable.from(['data: [DONE]\n\n']) })
  const empty = await invoke(createInsightsHandler({ appKey: 'secret', fetchImpl }), { facts })
  assert.equal(empty.status, 502)
  assert.equal(JSON.parse(empty.body).error, 'EMPTY_RESPONSE')
})

test('security defaults are conservative and configurable', () => {
  assert.deepEqual(securityConfig({}), { perIpPerHour: 5, maxConcurrent: 2, dailyLimit: 50, demoPassword: '', trustProxy: false })
  assert.deepEqual(securityConfig({ ADP_RATE_LIMIT_PER_HOUR: '8', ADP_MAX_CONCURRENT: '3', ADP_DAILY_REQUEST_LIMIT: '70', ADP_DEMO_PASSWORD: 'configured', ADP_TRUST_PROXY: 'true' }), { perIpPerHour: 8, maxConcurrent: 3, dailyLimit: 70, demoPassword: 'configured', trustProxy: true })
})

test('per-IP limiter counts invalid requests and returns 429 without an upstream call', async () => {
  let upstreamCalls = 0
  const security = createInsightsSecurity({ config: config({ perIpPerHour: 2 }) })
  const handler = createInsightsHandler({ appKey: 'secret', security, fetchImpl: async () => { upstreamCalls += 1; return successResponse() } })

  assert.equal((await invoke(handler, '{', { raw: true, ip: '192.0.2.1' })).status, 400)
  assert.equal((await invoke(handler, { facts }, { ip: '192.0.2.1' })).status, 200)
  const limited = await invoke(handler, { facts }, { ip: '192.0.2.1' })
  assert.equal(limited.status, 429)
  assert.equal(JSON.parse(limited.body).error, 'RATE_LIMITED')
  assert.ok(Number(limited.headers['Retry-After']) > 0)
  assert.equal(upstreamCalls, 1)
  assert.equal((await invoke(handler, { facts }, { ip: '192.0.2.2' })).status, 200)
})

test('optional demo password rejects missing and incorrect Basic credentials', async () => {
  let upstreamCalls = 0
  const security = createInsightsSecurity({ config: config({ demoPassword: 'long-test-password' }) })
  const handler = createInsightsHandler({ appKey: 'secret', security, fetchImpl: async () => { upstreamCalls += 1; return successResponse() } })

  const missing = await invoke(handler, { facts }, { ip: '192.0.2.10' })
  assert.equal(missing.status, 401)
  assert.equal(JSON.parse(missing.body).error, 'ACCESS_REQUIRED')
  assert.match(missing.headers['WWW-Authenticate'], /^Basic /)
  assert.equal((await invoke(handler, { facts }, { ip: '192.0.2.10', authorization: authorization('wrong') })).status, 401)
  assert.equal((await invoke(handler, { facts }, { ip: '192.0.2.10', authorization: authorization('long-test-password') })).status, 200)
  assert.equal(upstreamCalls, 1)
})

test('global concurrency limit refuses a third simultaneous Tencent request', async () => {
  const pending = []
  let twoStarted
  const started = new Promise((resolve) => { twoStarted = resolve })
  const fetchImpl = async () => new Promise((resolve) => {
    pending.push(resolve)
    if (pending.length === 2) twoStarted()
  })
  const security = createInsightsSecurity({ config: config({ maxConcurrent: 2 }) })
  const handler = createInsightsHandler({ appKey: 'secret', security, fetchImpl })

  const first = invoke(handler, { facts }, { ip: '192.0.2.21' })
  const second = invoke(handler, { facts }, { ip: '192.0.2.22' })
  await started
  const busy = await invoke(handler, { facts }, { ip: '192.0.2.23' })
  assert.equal(busy.status, 429)
  assert.equal(JSON.parse(busy.body).error, 'CONCURRENCY_LIMIT')
  pending.forEach((resolve) => resolve(successResponse()))
  assert.deepEqual((await Promise.all([first, second])).map((result) => result.status), [200, 200])
})

test('daily ceiling counts failed upstream attempts before calling ADP', async () => {
  let upstreamCalls = 0
  const fetchImpl = async () => { upstreamCalls += 1; return { ok: false, status: 503, headers: new Headers(), body: Readable.from([]) } }
  const security = createInsightsSecurity({ config: config({ dailyLimit: 2 }) })
  const handler = createInsightsHandler({ appKey: 'secret', security, fetchImpl })

  assert.equal((await invoke(handler, { facts }, { ip: '192.0.2.31' })).status, 502)
  assert.equal((await invoke(handler, { facts }, { ip: '192.0.2.32' })).status, 502)
  const capped = await invoke(handler, { facts }, { ip: '192.0.2.33' })
  assert.equal(capped.status, 429)
  assert.equal(JSON.parse(capped.body).error, 'DAILY_LIMIT')
  assert.equal(upstreamCalls, 2)
})

test('timed-out upstream attempt consumes daily capacity and releases concurrency', async () => {
  let upstreamCalls = 0
  const fetchImpl = async (_url, { signal }) => {
    upstreamCalls += 1
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
  }
  const security = createInsightsSecurity({ config: config({ dailyLimit: 1, maxConcurrent: 1 }) })
  const handler = createInsightsHandler({ appKey: 'secret', security, fetchImpl, timeoutMs: 5 })

  assert.equal((await invoke(handler, { facts }, { ip: '192.0.2.41' })).status, 502)
  const capped = await invoke(handler, { facts }, { ip: '192.0.2.42' })
  assert.equal(capped.status, 429)
  assert.equal(JSON.parse(capped.body).error, 'DAILY_LIMIT')
  assert.equal(upstreamCalls, 1)
})
