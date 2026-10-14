import { createHash, timingSafeEqual } from 'node:crypto'

const HOUR_MS = 60 * 60 * 1000
const DEFAULTS = Object.freeze({ perIpPerHour: 5, maxConcurrent: 2, dailyLimit: 50 })

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value
}

function clientIp(request, trustProxy) {
  if (trustProxy) {
    const forwarded = firstHeader(request.headers?.['x-forwarded-for'])
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : ''
    if (first) return first.slice(0, 128)
  }
  return String(request.socket?.remoteAddress || 'unknown').slice(0, 128)
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest()
}

function suppliedPassword(request) {
  const authorization = firstHeader(request.headers?.authorization)
  if (typeof authorization !== 'string' || !authorization.startsWith('Basic ')) return null
  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8')
    const separator = decoded.indexOf(':')
    if (separator < 0 || decoded.slice(0, separator) !== 'careloop') return null
    return decoded.slice(separator + 1)
  } catch {
    return null
  }
}

export function securityConfig(environment = process.env) {
  return Object.freeze({
    perIpPerHour: positiveInteger(environment.ADP_RATE_LIMIT_PER_HOUR, DEFAULTS.perIpPerHour),
    maxConcurrent: positiveInteger(environment.ADP_MAX_CONCURRENT, DEFAULTS.maxConcurrent),
    dailyLimit: positiveInteger(environment.ADP_DAILY_REQUEST_LIMIT, DEFAULTS.dailyLimit),
    demoPassword: typeof environment.ADP_DEMO_PASSWORD === 'string' ? environment.ADP_DEMO_PASSWORD : '',
    trustProxy: environment.ADP_TRUST_PROXY === 'true',
  })
}

export function createInsightsSecurity({ config = securityConfig(), now = () => Date.now() } = {}) {
  const requestsByIp = new Map()
  let activeUpstream = 0
  let dailyAttempts = 0
  let dailyKey = new Date(now()).toISOString().slice(0, 10)

  function consumeIpRequest(request) {
    const current = now()
    const cutoff = current - HOUR_MS
    const ip = clientIp(request, config.trustProxy)
    const recent = (requestsByIp.get(ip) || []).filter((timestamp) => timestamp > cutoff)
    if (recent.length >= config.perIpPerHour) {
      const retryAfter = Math.max(1, Math.ceil((recent[0] + HOUR_MS - current) / 1000))
      requestsByIp.set(ip, recent)
      return { ok: false, retryAfter }
    }
    recent.push(current)
    requestsByIp.set(ip, recent)
    return { ok: true, remaining: config.perIpPerHour - recent.length }
  }

  function isAuthorized(request) {
    if (!config.demoPassword) return true
    const candidate = suppliedPassword(request)
    return candidate !== null && timingSafeEqual(digest(candidate), digest(config.demoPassword))
  }

  function beginUpstreamAttempt() {
    const today = new Date(now()).toISOString().slice(0, 10)
    if (today !== dailyKey) {
      dailyKey = today
      dailyAttempts = 0
    }
    if (activeUpstream >= config.maxConcurrent) return { ok: false, category: 'CONCURRENCY_LIMIT' }
    if (dailyAttempts >= config.dailyLimit) return { ok: false, category: 'DAILY_LIMIT' }

    activeUpstream += 1
    // Reserve before fetch. Failed calls, invalid ADP output, and timeouts all
    // remain counted because they consumed an upstream attempt.
    dailyAttempts += 1
    let released = false
    return {
      ok: true,
      release() {
        if (released) return
        released = true
        activeUpstream = Math.max(0, activeUpstream - 1)
      },
    }
  }

  return Object.freeze({ config, consumeIpRequest, isAuthorized, beginUpstreamAttempt })
}

