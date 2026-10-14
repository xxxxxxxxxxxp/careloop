import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createInsightsHandler } from './insightsHandler.js'

const facts = { classifiedOnsets: 6, inWindowOnsets: 4, outsideWindowOnsets: 2, excludedOnsets: 1, completeCycles: 3, dataSufficiencyLevel: 2 }
const safeText = 'The recorded history shows 4 of 6 onsets in the five-day window and 2 outside it. This summary is not a diagnosis or medical advice.'

function requestFor(body) {
  const request = Readable.from([JSON.stringify(body)])
  request.method = 'POST'
  request.url = '/api/insights'
  request.headers = { 'content-type': 'application/json' }
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

async function invoke(handler, body) {
  const target = captureResponse()
  await handler(requestFor(body), target.response)
  await target.completed
  return target.captured
}

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
