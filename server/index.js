import { createServer } from 'node:http'
import { createInsightsHandler } from './insightsHandler.js'
import { createInsightsSecurity } from './insightsSecurity.js'
import { loadLocalEnv } from './loadEnv.js'

const envFileLoaded = loadLocalEnv()
const port = Number.parseInt(process.env.ADP_PORT || '8787', 10)
const diagnosticsEnabled = process.env.NODE_ENV !== 'production' && process.env.ADP_DIAGNOSTICS !== 'disable'
const diagnostic = (category, details = {}) => {
  if (diagnosticsEnabled) console.info(`[careloop-adp] ${category}`, JSON.stringify(details))
}
const security = createInsightsSecurity()
const insightsHandler = createInsightsHandler({ diagnostic, security })

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  if (request.method === 'POST' && url.pathname === '/api/insights') {
    await insightsHandler(request, response)
    return
  }
  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ error: 'NOT_FOUND' }))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`CareLoop ADP server listening on http://127.0.0.1:${port}`)
  diagnostic('server.ready', {
    port,
    envFileLoaded,
    credentialsConfigured: Boolean(process.env.ADP_APP_KEY?.trim()),
    demoPasswordConfigured: Boolean(security.config.demoPassword),
    perIpPerHour: security.config.perIpPerHour,
    maxConcurrent: security.config.maxConcurrent,
    dailyLimit: security.config.dailyLimit,
    trustProxy: security.config.trustProxy,
  })
})

