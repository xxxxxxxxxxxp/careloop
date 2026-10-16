import test from 'node:test'
import assert from 'node:assert/strict'
import { ADP_DEMONSTRATION_URL, GITHUB_PAGES_AI_NOTICE, aiAvailabilityForBase, aiAvailabilityForEnvironment, requestExplanationWhenAvailable } from './deploymentMode.js'

test('GitHub Pages base disables live generation and supplies the friendly explanation', () => {
  const availability = aiAvailabilityForBase('/careloop/')
  assert.equal(availability.liveGeneration, false)
  assert.equal(availability.notice.title, 'AI explanations are unavailable in this online demo')
  const message = `${availability.notice.beforeLink}${availability.notice.linkText}${availability.notice.afterLink}`
  assert.equal(availability.notice, GITHUB_PAGES_AI_NOTICE)
  assert.equal(message, "CareLoop's Tencent ADP integration works through a secure local backend that protects its API credentials. Since GitHub Pages only hosts the frontend, live AI generation isn't available here. The recorded-pattern summary below is still available. See our GitHub README for screenshots demonstrating the working AI integration.")
  assert.match(ADP_DEMONSTRATION_URL, /github\.com\/xxxxxxxxxxxp\/careloop#tencent-cloud-adp-integration--demonstration$/)
})

test('localhost and Node-hosted production bases retain live AI generation', () => {
  assert.deepEqual(aiAvailabilityForBase('/'), { liveGeneration: true, notice: null })
  assert.deepEqual(aiAvailabilityForBase('/future-node-deployment/'), { liveGeneration: true, notice: null })
})

test('the public GitHub hostname remains protected if a Pages build flag is ever missing', () => {
  assert.equal(aiAvailabilityForEnvironment({ baseUrl: '/', hostname: 'xxxxxxxxxxxp.github.io', pathname: '/careloop/' }).liveGeneration, false)
  assert.equal(aiAvailabilityForEnvironment({ baseUrl: '/', hostname: 'xxxxxxxxxxxp.github.io', pathname: '/careloop/index.html' }).liveGeneration, false)
  assert.equal(aiAvailabilityForEnvironment({ baseUrl: '/', hostname: 'careloop.example.com', pathname: '/careloop/' }).liveGeneration, true)
})

test('the Pages request guard never invokes the AI request callback', async () => {
  let calls = 0
  const pages = aiAvailabilityForEnvironment({ baseUrl: '/careloop/' })
  const skipped = await requestExplanationWhenAvailable(pages, async () => { calls += 1; return 'not expected' })
  assert.deepEqual(skipped, { attempted: false, value: null })
  assert.equal(calls, 0)

  const local = aiAvailabilityForEnvironment({ baseUrl: '/', hostname: 'localhost', pathname: '/' })
  const requested = await requestExplanationWhenAvailable(local, async () => { calls += 1; return 'validated explanation' })
  assert.deepEqual(requested, { attempted: true, value: 'validated explanation' })
  assert.equal(calls, 1)
})
