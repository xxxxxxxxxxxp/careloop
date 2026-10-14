import { randomUUID } from 'node:crypto'

export const ADP_ENDPOINT = 'https://wss.lke.tencentcloud.com/adp/v2/chat'

const MAX_EXPLANATION_LENGTH = 1800
const SAFE_FACT_KEYS = Object.freeze([
  'classifiedOnsets',
  'inWindowOnsets',
  'outsideWindowOnsets',
  'excludedOnsets',
  'completeCycles',
  'dataSufficiencyLevel',
])

export class AdpError extends Error {
  constructor(message, code, status = 502, details = {}) {
    super(message)
    this.name = 'AdpError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export const stripZeroWidth = (value) => typeof value === 'string' ? value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '') : value

export function validateFacts(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AdpError('A deterministic facts object is required.', 'INVALID_FACTS', 400)
  }
  if (Object.keys(input).some((key) => !SAFE_FACT_KEYS.includes(key))) {
    throw new AdpError('Only the supported aggregate facts may be sent.', 'INVALID_FACTS', 400)
  }
  const facts = {}
  for (const key of SAFE_FACT_KEYS) {
    const value = input[key]
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000) {
      throw new AdpError(`Invalid aggregate fact: ${key}.`, 'INVALID_FACTS', 400)
    }
    facts[key] = value
  }
  if (facts.dataSufficiencyLevel > 2 || facts.inWindowOnsets + facts.outsideWindowOnsets !== facts.classifiedOnsets) {
    throw new AdpError('The aggregate facts are inconsistent.', 'INVALID_FACTS', 400)
  }
  return Object.freeze(facts)
}

export function buildPrompt(facts) {
  return [
    'Explain the deterministic CareLoop pattern summary below in calm, plain English.',
    'These are synthetic aggregate facts. Treat them as the complete factual record.',
    'Do not calculate or introduce statistics, dates, symptoms, patient details, causes, predictions, diagnoses, treatments, or medication advice.',
    'Do not imply that menstruation caused migraine. Describe association only and acknowledge limited data when the sufficiency level is 0 or 1.',
    'Use at most two short paragraphs. End with: This summary is not a diagnosis or medical advice.',
    'The window is the five calendar days around a confirmed period start (days -2, -1, 1, 2, and 3).',
    `Facts: ${JSON.stringify(facts)}`,
  ].join('\n')
}

function completedReply(event) {
  const messages = event?.Response?.Messages
  if (!Array.isArray(messages)) return ''
  return messages
    .filter((message) => message?.Type === 'reply')
    .flatMap((message) => Array.isArray(message.Contents) ? message.Contents : [])
    .filter((content) => content?.Type === 'text' && typeof content.Text === 'string')
    .map((content) => content.Text)
    .join('')
}

function eventError(event) {
  const upstreamCode = event?.Error?.Code || event?.Code || 'UNKNOWN'
  const upstreamMessage = event?.Error?.Message || event?.Message || event?.StatusDesc || 'Unknown upstream error'
  return new AdpError(`Tencent ADP error ${upstreamCode}: ${upstreamMessage}`, 'UPSTREAM_EVENT_ERROR', 502, { upstreamCode })
}

function firstEventBoundary(buffer) {
  const matches = ['\r\n\r\n', '\n\n', '\r\r']
    .map((separator) => ({ separator, index: buffer.indexOf(separator) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index)
  return matches[0] || null
}

export async function parseAdpSse(body, { diagnostic = () => {} } = {}) {
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') {
    throw new AdpError('Tencent ADP returned no response stream.', 'INVALID_STREAM')
  }

  const decoder = new TextDecoder()
  const messageKinds = new Map()
  const content = new Map()
  let buffer = ''
  let completed = false
  let done = false
  let completedText = ''
  const seenEventTypes = new Set()

  const processBlock = (block) => {
    if (!block.trim()) return false
    let eventName = ''
    const dataLines = []
    for (const rawLine of block.split(/\r\n|\n|\r/)) {
      const line = rawLine.replace(/^\uFEFF/, '')
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (!dataLines.length) return false
    const rawData = dataLines.join('\n').trim().replace(/^\uFEFF/, '')
    if (rawData === '[DONE]') {
      if (!seenEventTypes.has('[DONE]')) diagnostic('adp.sse_event', { type: '[DONE]' })
      seenEventTypes.add('[DONE]')
      done = true
      return true
    }

    let event
    try { event = JSON.parse(rawData) } catch { throw new AdpError('Tencent ADP returned malformed SSE data.', 'INVALID_STREAM') }
    const type = event?.Type || eventName
    const messageId = event?.MessageId || event?.Message?.MessageId
    const safeType = typeof type === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(type) ? type : 'unknown'
    if (!seenEventTypes.has(safeType)) diagnostic('adp.sse_event', { type: safeType })
    seenEventTypes.add(safeType)

    if (type === 'message.added' && messageId) messageKinds.set(messageId, event?.Message?.Type)
    if (type === 'error') throw eventError(event)
    if (type === 'text.delta' || type === 'text.replace') {
      if (typeof event.Text !== 'string') throw new AdpError('Tencent ADP returned a text event without top-level Text.', 'INVALID_STREAM')
      if (messageKinds.get(messageId) === 'thought') return false
      const key = `${messageId || 'reply'}:${event?.ContentIndex ?? 0}`
      if (type === 'text.replace') content.clear()
      content.set(key, type === 'text.replace' ? event.Text : `${content.get(key) || ''}${event.Text}`)
    }
    if (type === 'response.completed') {
      if (event?.Response?.Status && event.Response.Status !== 'success') throw new AdpError(eventError(event.Response), 'UPSTREAM_EVENT_ERROR')
      completedText = completedReply(event)
      completed = true
      return true
    }
    return false
  }

  for await (const chunk of body) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    let boundary
    while ((boundary = firstEventBoundary(buffer))) {
      const block = buffer.slice(0, boundary.index)
      buffer = buffer.slice(boundary.index + boundary.separator.length)
      if (processBlock(block)) break
    }
    if (completed || done) break
  }
  buffer += decoder.decode()
  if (!completed && !done && buffer.trim()) processBlock(buffer)

  const streamedText = [...content.values()].join('')
  // Completed content is a fallback, never an addition, so a streamed answer
  // cannot be duplicated by response.completed.
  const text = stripZeroWidth(streamedText || completedText).trim()
  if (!text) throw new AdpError('Tencent ADP returned no explanation.', 'EMPTY_RESPONSE')
  return text
}

export function validateExplanation(value, facts) {
  if (typeof value !== 'string') throw new AdpError('The generated explanation was not text.', 'INVALID_OUTPUT', 422)
  const text = value.trim()
  if (text.length < 20 || text.length > MAX_EXPLANATION_LENGTH) {
    throw new AdpError('The generated explanation had an unsafe length.', 'INVALID_OUTPUT', 422)
  }
  if (!text.endsWith('This summary is not a diagnosis or medical advice.')) {
    throw new AdpError('The generated explanation omitted the required safety statement.', 'INVALID_OUTPUT', 422)
  }

  const unsafePatterns = [
    /\b(?:you have|diagnosed with|diagnosed as|diagnose as|suffer(?:ing)? from)\b/i,
    /\b(?:take|start|stop|increase|decrease|prescri(?:be|ption)|dosage|dose)\b.{0,40}\b(?:medicine|medication|drug|mg|tablet|pill|ibuprofen|paracetamol|acetaminophen|triptan|aspirin|naproxen)\b/i,
    /\b(?:should|must|recommend|consider)\b.{0,50}\b(?:take|use|avoid|medication|medicine|drug|dose|ibuprofen|paracetamol|acetaminophen|triptan|aspirin|naproxen)\b/i,
    /\b(?:menstruation|periods?|hormones?)\b.{0,30}\bcaus(?:e|ed|es|ing)\b|\bcaus(?:e|ed|es|ing)\b.{0,30}\b(?:migraine|headache|episode|onset)s?\b/i,
    /\b(?:is|indicates?|means?|shows?)\b.{0,30}\b(?:menstrual migraine|condition|disorder|disease)\b/i,
    /\b(?:nausea|aura|vomiting|light sensitivity|sound sensitivity)\b/i,
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b(?:definitely|proves?|confirms?|caused? by|will happen|will recur)\b/i,
    /\b(?:pregnan(?:t|cy)|medical history|patient record|patient name)\b/i,
  ]
  if (unsafePatterns.some((pattern) => pattern.test(text))) {
    throw new AdpError('The generated explanation contained unsupported health guidance or claims.', 'INVALID_OUTPUT', 422)
  }

  const allowedNumbers = new Set([5, 2, 1, 3, ...Object.values(facts)])
  const numericClaims = text.match(/(?<![\w-])\d+(?:\.\d+)?%?/g) || []
  if (numericClaims.some((claim) => claim.endsWith('%') || !allowedNumbers.has(Number(claim)))) {
    throw new AdpError('The generated explanation introduced an unsupported statistic.', 'INVALID_OUTPUT', 422)
  }
  return text
}

export async function requestAdpExplanation({ facts: input, appKey, fetchImpl = fetch, signal, diagnostic = () => {} } = {}) {
  if (typeof appKey !== 'string' || !appKey.trim()) {
    throw new AdpError('ADP_APP_KEY is not configured.', 'MISSING_CREDENTIALS', 503)
  }
  const facts = validateFacts(input)
  const requestId = randomUUID()
  const conversationId = randomUUID()
  diagnostic('adp.request', { endpoint: new URL(ADP_ENDPOINT).host, stream: true, incremental: true })
  let response
  try {
    response = await fetchImpl(ADP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        RequestId: requestId,
        ConversationId: conversationId,
        AppKey: appKey,
        VisitorId: `careloop-local-${randomUUID()}`,
        Contents: [{ Type: 'text', Text: buildPrompt(facts) }],
        Stream: 'enable',
        Incremental: true,
      }),
      signal,
    })
  } catch (error) {
    if (error instanceof AdpError) throw error
    throw new AdpError('Could not reach Tencent ADP.', 'UPSTREAM_UNAVAILABLE')
  }
  diagnostic('adp.http_response', {
    status: response?.status || null,
    contentType: response?.headers?.get?.('content-type') || null,
  })
  if (!response?.ok) throw new AdpError(`Tencent ADP request failed with status ${response?.status || 'unknown'}.`, 'UPSTREAM_HTTP_ERROR')
  return validateExplanation(await parseAdpSse(response.body, { diagnostic }), facts)
}

