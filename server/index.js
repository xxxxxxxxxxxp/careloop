import { createCareLoopServer, resolveServerConfig } from './app.js'
import { createInsightsHandler } from './insightsHandler.js'
import { createInsightsSecurity } from './insightsSecurity.js'
import { loadLocalEnv } from './loadEnv.js'

const envFileLoaded = loadLocalEnv()
const { host, port, production } = resolveServerConfig()
const diagnosticsEnabled = process.env.NODE_ENV !== 'production' && process.env.ADP_DIAGNOSTICS !== 'disable'
const diagnostic = (category, details = {}) => {
  if (diagnosticsEnabled) console.info(`[careloop-adp] ${category}`, JSON.stringify(details))
}
const security = createInsightsSecurity()
const insightsHandler = createInsightsHandler({ diagnostic, security })

const server = createCareLoopServer({ insightsHandler })

server.listen(port, host, () => {
  console.log(`CareLoop server listening on http://${host}:${port}`)
  diagnostic('server.ready', {
    host,
    port,
    production,
    envFileLoaded,
    credentialsConfigured: Boolean(process.env.ADP_APP_KEY?.trim()),
    demoPasswordConfigured: Boolean(security.config.demoPassword),
    perIpPerHour: security.config.perIpPerHour,
    maxConcurrent: security.config.maxConcurrent,
    dailyLimit: security.config.dailyLimit,
    trustProxy: security.config.trustProxy,
  })
})

