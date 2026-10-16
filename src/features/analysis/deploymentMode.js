export const GITHUB_PAGES_BASE_URL = '/careloop/'
export const ADP_DEMONSTRATION_URL = 'https://github.com/xxxxxxxxxxxp/careloop#tencent-cloud-adp-integration--demonstration'
export const GITHUB_PAGES_AI_NOTICE = Object.freeze({
  title: 'AI explanations are unavailable in this online demo',
  beforeLink: "CareLoop's Tencent ADP integration works through a secure local backend that protects its API credentials. Since GitHub Pages only hosts the frontend, live AI generation isn't available here. The recorded-pattern summary below is still available. See our ",
  linkText: 'GitHub README',
  afterLink: ' for screenshots demonstrating the working AI integration.',
})

export function aiAvailabilityForBase(baseUrl) {
  return baseUrl === GITHUB_PAGES_BASE_URL
    ? { liveGeneration: false, notice: GITHUB_PAGES_AI_NOTICE }
    : { liveGeneration: true, notice: null }
}
