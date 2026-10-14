import { AdpError, requestAdpExplanation } from './adpClient.js'

const MAX_BODY_BYTES = 4096

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
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

export function createInsightsHandler({ appKey = process.env.ADP_APP_KEY, fetchImpl = fetch, diagnostic = () => {} } = {}) {
  return async function insightsHandler(request, response) {
    diagnostic('api.request', {
      method: request.method,
      path: request.url?.split('?')[0],
      contentType: request.headers?.['content-type'] || null,
      credentialsConfigured: Boolean(appKey?.trim()),
    })
    try {
      const body = await readJson(request)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)
      let explanation
      try {
        explanation = await requestAdpExplanation({ facts: body?.facts, appKey, fetchImpl, signal: controller.signal, diagnostic })
      } finally {
        clearTimeout(timeout)
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

