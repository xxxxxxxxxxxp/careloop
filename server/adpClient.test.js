import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { parseAdpSse, requestAdpExplanation } from './adpClient.js'

const facts = {
  classifiedOnsets: 6,
  inWindowOnsets: 4,
  outsideWindowOnsets: 2,
  excludedOnsets: 1,
  completeCycles: 3,
  dataSufficiencyLevel: 2,
}
const safeText = 'The recorded history shows 4 of 6 onsets in the five-day window and 2 outside it. This summary is not a diagnosis or medical advice.'
const sseResponse = (...chunks) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: Readable.from(chunks) })

test('sends the required ADP fields without exposing extra patient data and parses deltas', async () => {
  let request
  const fetchImpl = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) }
    return sseResponse(
      'event: text.delta\ndata: {"Type":"text.delta","MessageId":"reply","ContentIndex":0,"Text":"The recorded history shows 4 of 6 onsets in the five-day window "}\n\n',
      'data: {"Type":"text.delta","MessageId":"reply","ContentIndex":0,"Text":"and 2 outside it. This summary is not a diagnosis or medical advice."}\n\n',
      'event: response.completed\ndata: {"Type":"response.completed","Response":{"Status":"success"}}\n\n',
      'data: [DONE]\n\n',
    )
  }
  assert.equal(await requestAdpExplanation({ facts, appKey: 'server-secret', fetchImpl }), safeText)
  assert.equal(request.url, 'https://wss.lke.tencentcloud.com/adp/v2/chat')
  assert.equal(request.body.AppKey, 'server-secret')
  assert.equal(request.body.Stream, 'enable')
  assert.equal(request.body.Incremental, true)
  assert.match(request.body.RequestId, /^[0-9a-f-]{36}$/)
  assert.match(request.body.ConversationId, /^[0-9a-f-]{36}$/)
  assert.deepEqual(Object.keys(request.body.Contents[0]).sort(), ['Text', 'Type'])
  assert.doesNotMatch(request.body.Contents[0].Text, /server-secret/)
})

test('text.replace replaces prior text for the same content item', async () => {
  const fetchImpl = async () => sseResponse(
    'data: {"Type":"text.delta","MessageId":"reply","ContentIndex":0,"Text":"Discard "}\n\n',
    'data: {"Type":"text.delta","MessageId":"reply","ContentIndex":1,"Text":"this draft."}\r\n\r',
    `\ndata: ${JSON.stringify({ Type: 'text.replace', MessageId: 'reply', ContentIndex: 0, Text: safeText })}\r\r`,
    'data: [DONE]\n\ndata: this trailing event must not be parsed\n\n',
  )
  assert.equal(await requestAdpExplanation({ facts, appKey: 'key', fetchImpl }), safeText)
})

test('uses completed reply content without duplicating streamed deltas', async () => {
  const completed = {
    Type: 'response.completed',
    Response: { Status: 'success', Messages: [{ Type: 'reply', Contents: [{ Type: 'text', Text: safeText }] }] },
  }
  const deltaAndCompleted = Readable.from([
    `data: ${JSON.stringify({ Type: 'text.delta', Text: safeText })}\n\n`,
    `data: ${JSON.stringify(completed)}\n\n`,
  ])
  assert.equal(await parseAdpSse(deltaAndCompleted), safeText)
  assert.equal(await parseAdpSse(Readable.from([`data: ${JSON.stringify(completed)}\n\n`])), safeText)
})

test('handles chunk-split CRLF events and removes zero-width answer characters', async () => {
  const withInvisible = safeText.replace('history', 'his\u200Btory').replace('This summary', '\uFEFFThis summary')
  const encoded = `event: text.delta\r\ndata: ${JSON.stringify({ Type: 'text.delta', Text: withInvisible })}\r\n\r\ndata: [DONE]\r\n\r\n`
  const chunks = [encoded.slice(0, 17), encoded.slice(17, 71), encoded.slice(71, -3), encoded.slice(-3)]
  assert.equal(await parseAdpSse(Readable.from(chunks)), safeText)
})

test('inspects Tencent error codes and rejects malformed or empty streams distinctly', async () => {
  const errorEvent = Readable.from(['data: {"Type":"error","Error":{"Code":"BadAppKey","Message":"authentication failed"}}\n\n'])
  await assert.rejects(parseAdpSse(errorEvent), (error) => error.code === 'UPSTREAM_EVENT_ERROR' && error.details.upstreamCode === 'BadAppKey' && /authentication failed/.test(error.message))
  await assert.rejects(parseAdpSse(Readable.from(['data: not-json\n\n'])), { code: 'INVALID_STREAM' })
  await assert.rejects(parseAdpSse(Readable.from(['data: [DONE]\n\n'])), { code: 'EMPTY_RESPONSE' })
})

test('rejects an upstream API error', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, body: Readable.from([]) })
  await assert.rejects(requestAdpExplanation({ facts, appKey: 'bad-key', fetchImpl }), { code: 'UPSTREAM_HTTP_ERROR', status: 502 })
})

test('rejects missing server credentials before calling ADP', async () => {
  let called = false
  const fetchImpl = async () => { called = true }
  await assert.rejects(requestAdpExplanation({ facts, appKey: '', fetchImpl }), { code: 'MISSING_CREDENTIALS', status: 503 })
  assert.equal(called, false)
})

test('rejects unsafe or ungrounded model output', async () => {
  const invalid = 'You have a migraine diagnosis and should take medication at a 50% higher dose.'
  const fetchImpl = async () => sseResponse(
    `data: ${JSON.stringify({ Type: 'text.delta', Text: invalid })}\n\n`,
    'data: {"Type":"response.completed","Response":{"Status":"success"}}\n\n',
  )
  await assert.rejects(requestAdpExplanation({ facts, appKey: 'key', fetchImpl }), { code: 'INVALID_OUTPUT', status: 422 })
})

test('rejects unexpected browser fields so raw records cannot pass through', async () => {
  await assert.rejects(requestAdpExplanation({ facts: { ...facts, diaryNotes: 'private note' }, appKey: 'key', fetchImpl: async () => null }), { code: 'INVALID_FACTS', status: 400 })
})

