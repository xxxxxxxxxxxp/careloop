import test from 'node:test'
import assert from 'node:assert/strict'
import { ADP_DEMONSTRATION_URL, GITHUB_PAGES_AI_NOTICE, aiAvailabilityForBase } from './deploymentMode.js'

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
