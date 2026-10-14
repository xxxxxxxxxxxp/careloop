import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function parsePort(value, name) {
  const port = Number(value)

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`)
  }

  return port
}

export function resolveServerConfig(environment = process.env) {
  const platformPort = environment.PORT?.trim()
  const localPort = environment.ADP_PORT?.trim()
  const production = environment.NODE_ENV === 'production'

  return {
    host: production ? '0.0.0.0' : '127.0.0.1',
    port: parsePort(platformPort || localPort || '8787', platformPort ? 'PORT' : 'ADP_PORT'),
    production,
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/')
}

function safeStaticPath(staticRoot, pathname) {
  let decodedPath

  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return null
  }

  const relativePath = decodedPath.replace(/^\/+/, '')
  const candidate = resolve(staticRoot, relativePath || 'index.html')

  if (candidate !== staticRoot && !candidate.startsWith(`${staticRoot}${sep}`)) {
    return null
  }

  return candidate
}

async function existingFile(filePath) {
  try {
    const fileStats = await stat(filePath)
    return fileStats.isFile()
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false
    throw error
  }
}

async function sendFile(request, response, filePath, { spaDocument = false } = {}) {
  const body = await readFile(filePath)
  const extension = extname(filePath).toLowerCase()
  const immutableAsset = filePath.includes(`${sep}assets${sep}`)

  response.writeHead(200, {
    'Cache-Control': spaDocument
      ? 'no-cache'
      : immutableAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
    'Content-Length': body.length,
    'Content-Type': CONTENT_TYPES.get(extension) || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(request.method === 'HEAD' ? undefined : body)
}

function sendNotFound(response, pathname) {
  sendJson(response, 404, {
    error: 'not_found',
    message: isApiPath(pathname) ? 'API endpoint not found.' : 'Resource not found.',
  })
}

export function createCareLoopServer({
  distDir = resolve(process.cwd(), 'dist'),
  insightsHandler,
} = {}) {
  if (typeof insightsHandler !== 'function') {
    throw new TypeError('An insightsHandler function is required.')
  }

  const staticRoot = resolve(distDir)

  return createServer(async (request, response) => {
    let url

    try {
      url = new URL(request.url, 'http://localhost')
    } catch {
      sendJson(response, 400, {
        error: 'invalid_request',
        message: 'The request URL is invalid.',
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/insights') {
      await insightsHandler(request, response)
      return
    }

    if (isApiPath(url.pathname)) {
      sendNotFound(response, url.pathname)
      return
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendNotFound(response, url.pathname)
      return
    }

    try {
      const requestedFile = safeStaticPath(staticRoot, url.pathname)

      if (requestedFile && await existingFile(requestedFile)) {
        await sendFile(request, response, requestedFile, {
          spaDocument: extname(requestedFile).toLowerCase() === '.html',
        })
        return
      }

      // Missing asset-like paths receive a real 404; extensionless paths are
      // handled by the React router through the SPA document.
      if (extname(url.pathname)) {
        sendNotFound(response, url.pathname)
        return
      }

      const indexFile = resolve(staticRoot, 'index.html')
      if (!await existingFile(indexFile)) {
        sendJson(response, 503, {
          error: 'frontend_unavailable',
          message: 'The frontend build is unavailable.',
        })
        return
      }

      await sendFile(request, response, indexFile, { spaDocument: true })
    } catch {
      if (!response.headersSent) {
        sendJson(response, 500, {
          error: 'server_error',
          message: 'The server could not complete the request.',
        })
      } else {
        response.destroy()
      }
    }
  })
}
