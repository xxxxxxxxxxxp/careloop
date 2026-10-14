export class AiExplanationError extends Error {
  constructor(message, category, status = null) {
    super(message)
    this.name = 'AiExplanationError'
    this.category = category
    this.status = status
  }
}

const stripZeroWidth = (value) => typeof value === 'string' ? value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '') : value
const errorMessages = {
  MISSING_CREDENTIALS: 'AI explanation is not configured on the local server.',
  UPSTREAM_UNAVAILABLE: 'The local server could not reach Tencent ADP.',
  UPSTREAM_HTTP_ERROR: 'Tencent ADP returned an API error.',
  UPSTREAM_EVENT_ERROR: 'Tencent ADP reported an error while generating the explanation.',
  EMPTY_RESPONSE: 'Tencent ADP returned an empty explanation.',
  INVALID_STREAM: 'Tencent ADP returned an invalid streaming response.',
  INVALID_OUTPUT: 'The generated explanation was rejected by CareLoop safety checks.',
  INVALID_FACTS: 'The deterministic insight summary could not be sent safely.',
  ACCESS_REQUIRED: 'Enter the demo access password to use the AI explanation.',
  RATE_LIMITED: 'Too many AI explanation requests. Please try again later.',
  CONCURRENCY_LIMIT: 'The AI service is busy. Please try again shortly.',
  DAILY_LIMIT: 'The daily AI explanation limit has been reached. Please use the recorded summary.',
  INTERNAL_ERROR: 'The local AI backend encountered an unexpected error.',
}

function diagnostic(category, details) {
  if (import.meta.env?.DEV) console.info(`[careloop-ai] ${category}`, details)
}

export function explanationFacts(result) {
  return {
    classifiedOnsets: result.counts.classified,
    inWindowOnsets: result.counts.inWindow,
    outsideWindowOnsets: result.counts.outsideWindow,
    excludedOnsets: result.counts.excluded,
    completeCycles: result.dataSufficiency.completeCycles,
    dataSufficiencyLevel: result.dataSufficiency.level,
  }
}

function basicAuthorization(password) {
  const bytes = new TextEncoder().encode(`careloop:${password}`)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return `Basic ${btoa(binary)}`
}

export async function fetchAiExplanation(facts, { fetchImpl = fetch, signal, demoPassword = '' } = {}) {
  let response
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (demoPassword) headers.Authorization = basicAuthorization(demoPassword)
    response = await fetchImpl('/api/insights', {
      method: 'POST',
      headers,
      body: JSON.stringify({ facts }),
      signal,
    })
  } catch {
    diagnostic('request.failure', { category: 'NETWORK_ERROR' })
    throw new AiExplanationError('The local AI backend could not be reached.', 'NETWORK_ERROR')
  }
  const contentType = response.headers?.get?.('content-type') || ''
  diagnostic('response.received', { status: response.status, contentType: contentType || null })
  let data
  try {
    const raw = await response.text()
    if (!contentType.toLowerCase().includes('application/json')) throw new TypeError('Expected JSON content type')
    data = JSON.parse(stripZeroWidth(raw))
  } catch {
    diagnostic('response.failure', { category: 'INVALID_BACKEND_RESPONSE', status: response.status, contentType: contentType || null })
    throw new AiExplanationError('The local AI backend returned a non-JSON response.', 'INVALID_BACKEND_RESPONSE', response.status)
  }
  if (!response.ok) {
    const category = typeof data?.error === 'string' ? data.error : 'INVALID_BACKEND_RESPONSE'
    diagnostic('response.failure', { category, status: response.status })
    throw new AiExplanationError(errorMessages[category] || 'The AI explanation is unavailable.', category, response.status)
  }
  const explanation = typeof data?.explanation === 'string' ? stripZeroWidth(data.explanation).trim() : ''
  if (data?.source !== 'tencent-adp' || typeof data?.explanation !== 'string' || explanation.length < 20) {
    diagnostic('response.failure', { category: 'INVALID_BACKEND_RESPONSE', status: response.status })
    throw new AiExplanationError('The local AI backend returned an invalid response.', 'INVALID_BACKEND_RESPONSE', response.status)
  }
  return explanation
}

