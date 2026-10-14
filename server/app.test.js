import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import test from 'node:test'
import { createCareLoopServer, resolveServerConfig } from './app.js'

test('server configuration prefers Render PORT and binds publicly in production', () => {
  assert.deepEqual(resolveServerConfig({
    NODE_ENV: 'production',
    PORT: '10000',
    ADP_PORT: '8787',
  }), {
    host: '0.0.0.0',
    port: 10000,
    production: true,
  })
})

test('server configuration preserves the local host and ADP_PORT fallback', () => {
  assert.deepEqual(resolveServerConfig({ ADP_PORT: '9876' }), {
    host: '127.0.0.1',
    port: 9876,
    production: false,
  })

  assert.equal(resolveServerConfig({}).port, 8787)
})

test('server configuration rejects invalid platform ports', () => {
  assert.throws(
    () => resolveServerConfig({ NODE_ENV: 'production', PORT: 'not-a-port' }),
    /PORT must be an integer between 1 and 65535/,
  )
})

test('production server serves assets, SPA routes, and isolated API routing', async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'careloop-server-'))
  const distDir = join(temporaryRoot, 'dist')
  await mkdir(join(distDir, 'assets'), { recursive: true })
  await writeFile(join(distDir, 'index.html'), '<!doctype html><title>CareLoop production</title>')
  await writeFile(join(distDir, 'assets', 'app.js'), 'globalThis.careLoopLoaded = true')

  let insightsCalls = 0
  const server = createCareLoopServer({
    distDir,
    insightsHandler: async (_request, response) => {
      insightsCalls += 1
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ explanation: 'mocked' }))
    },
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`

  context.after(async () => {
    server.close()
    await once(server, 'close')
    await rm(temporaryRoot, { recursive: true, force: true })
  })

  const rootResponse = await fetch(`${baseUrl}/`)
  assert.equal(rootResponse.status, 200)
  assert.match(rootResponse.headers.get('content-type'), /^text\/html/)
  assert.match(await rootResponse.text(), /CareLoop production/)

  const assetResponse = await fetch(`${baseUrl}/assets/app.js`)
  assert.equal(assetResponse.status, 200)
  assert.match(assetResponse.headers.get('content-type'), /^text\/javascript/)
  assert.match(assetResponse.headers.get('cache-control'), /immutable/)
  assert.match(await assetResponse.text(), /careLoopLoaded/)

  const routeResponse = await fetch(`${baseUrl}/ai-insights`)
  assert.equal(routeResponse.status, 200)
  assert.match(await routeResponse.text(), /CareLoop production/)

  const headResponse = await fetch(`${baseUrl}/calendar`, { method: 'HEAD' })
  assert.equal(headResponse.status, 200)
  assert.equal(await headResponse.text(), '')

  const apiResponse = await fetch(`${baseUrl}/api/insights`, { method: 'POST' })
  assert.equal(apiResponse.status, 200)
  assert.deepEqual(await apiResponse.json(), { explanation: 'mocked' })
  assert.equal(insightsCalls, 1)

  const wrongMethodResponse = await fetch(`${baseUrl}/api/insights`)
  assert.equal(wrongMethodResponse.status, 404)
  assert.equal((await wrongMethodResponse.json()).error, 'not_found')
  assert.equal(insightsCalls, 1)

  const unknownApiResponse = await fetch(`${baseUrl}/api/unknown`)
  assert.equal(unknownApiResponse.status, 404)
  assert.equal((await unknownApiResponse.json()).error, 'not_found')

  const missingAssetResponse = await fetch(`${baseUrl}/assets/missing.js`)
  assert.equal(missingAssetResponse.status, 404)
  assert.equal((await missingAssetResponse.json()).error, 'not_found')
})

test('production server reports a missing build without affecting API 404s', async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'careloop-empty-server-'))
  const server = createCareLoopServer({
    distDir: temporaryRoot,
    insightsHandler: async () => {},
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`

  context.after(async () => {
    server.close()
    await once(server, 'close')
    await rm(temporaryRoot, { recursive: true, force: true })
  })

  const frontendResponse = await fetch(`${baseUrl}/dashboard`)
  assert.equal(frontendResponse.status, 503)
  assert.equal((await frontendResponse.json()).error, 'frontend_unavailable')

  const apiResponse = await fetch(`${baseUrl}/api/missing`)
  assert.equal(apiResponse.status, 404)
  assert.equal((await apiResponse.json()).error, 'not_found')
})
