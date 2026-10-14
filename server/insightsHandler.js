import { AdpError, requestAdpExplanation, validateFacts } from './adpClient.js'
import { createInsightsSecurity } from './insightsSecurity.js'

const MAX_BODY_BYTES = 4096

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  })
  response.end(JSON.stringify(body))
}

async function readJson(request) {
  let raw = ''
  for await (const chunk of request) {
    raw += chunk
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new AdpError('Request body is too large.', 'INVALID_REQUEST', 413)
  }
  try { return JSON.parse(raw) } catch { throw new AdpError('Request body must be valid JSON.', 'INVALID_REQUEST', 400) }
}

export function createInsightsHandler({ appKey = process.env.ADP_APP_KEY, fetchImpl = fetch, diagnostic = () => {}, security = createInsightsSecurity(), timeoutMs = 45000 } = {}) {
  return async function insightsHandler(request, response) {
    diagnostic('api.request', {
      method: request.method,
      path: request.url?.split('?')[0],
      contentType: request.headers?.['content-type'] || null,
      credentialsConfigured: Boolean(appKey?.trim()),
    })
    const ipLimit = security.consumeIpRequest(request)
    if (!ipLimit.ok) {
      diagnostic('api.failure', { status: 429, category: 'RATE_LIMITED' })
      sendJson(response, 429, { error: 'RATE_LIMITED', message: 'Too many AI explanation requests. Please try again later.' }, { 'Retry-After': String(ipLimit.retryAfter) })
      return
    }
    if (!security.isAuthorized(request)) {
      diagnostic('api.failure', { status: 401, category: 'ACCESS_REQUIRED' })
      sendJson(response, 401, { error: 'ACCESS_REQUIRED', message: 'Demo access password required.' }, { 'WWW-Authenticate': 'Basic realm="CareLoop Demo", charset="UTF-8"' })
      return
    }
    try {
      const body = await readJson(request)
      const facts = validateFacts(body?.facts)
      if (typeof appKey !== 'string' || !appKey.trim()) throw new AdpError('ADP_APP_KEY is not configured.', 'MISSING_CREDENTIALS', 503)
      const reservation = security.beginUpstreamAttempt()
      if (!reservation.ok) {
        const message = reservation.category === 'DAILY_LIMIT'
          ? 'The daily AI explanation limit has been reached. Please use the recorded summary.'
          : 'The AI service is busy. Please try again shortly.'
        diagnostic('api.failure', { status: 429, category: reservation.category })
        sendJson(response, 429, { error: reservation.category, message }, { 'Retry-After': reservation.category === 'CONCURRENCY_LIMIT' ? '10' : '3600' })
        return
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      let explanation
      try {
        explanation = await requestAdpExplanation({ facts, appKey, fetchImpl, signal: controller.signal, diagnostic })
      } finally {
        clearTimeout(timeout)
        reservation.release()
      }
      diagnostic('api.success', { status: 200, responseType: 'application/json' })
      sendJson(response, 200, { explanation, source: 'tencent-adp' })
    } catch (error) {
      const known = error instanceof AdpError
      if (!known) console.error('Unexpected insights error:', error)
      diagnostic('api.failure', {
        status: known ? error.status : 500,
        category: known ? error.code : 'INTERNAL_ERROR',
        upstreamCode: known ? error.details?.upstreamCode || null : null,
      })
      sendJson(response, known ? error.status : 500, {
        error: known ? error.code : 'INTERNAL_ERROR',
        message: known && error.status < 500 ? error.message : 'AI explanation is unavailable. Use the recorded summary instead.',
      })
    }
  }
}

