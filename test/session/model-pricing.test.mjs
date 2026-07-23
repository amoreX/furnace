import assert from "node:assert/strict"
import { test } from "node:test"

const {
  catalogPricingForModel,
  normalizeTokenPricing,
  parseUsageCostUsd,
  resolveModelPricing,
} = await import("../../dist/session/model-pricing.js")
const { calculateUsageCostUsd } = await import("../../dist/session/usage-cost.js")

test("deepseek catalog pricing estimates non-zero session cost", () => {
  const pricing = catalogPricingForModel("deepseek-v4-flash")
  assert.ok(pricing)
  const cost = calculateUsageCostUsd({ promptTokens: 1_000_000, completionTokens: 500_000 }, pricing)
  assert.equal(cost, 0.14 + 0.14)
  assert.equal(
    calculateUsageCostUsd({ promptTokens: 0, cacheReadTokens: 1_000_000, completionTokens: 0 }, pricing),
    0.0028,
  )
})

test("catalog pricing covers direct OpenAI and Anthropic model variants", () => {
  assert.equal(catalogPricingForModel("gpt-4o-mini-2024-07-18").completion, 0.6 / 1_000_000)
  assert.equal(catalogPricingForModel("anthropic/claude-sonnet-4.6").cacheWrite, 3.75 / 1_000_000)
})

test("resolveModelPricing prefers API pricing and falls back to catalog", () => {
  assert.deepEqual(
    resolveModelPricing("deepseek-v4-flash", { prompt: 0.000001, completion: 0.000002 }),
    { prompt: 0.000001, completion: 0.000002 },
  )
  assert.ok(resolveModelPricing("deepseek/deepseek-v4-pro"))
  assert.equal(normalizeTokenPricing({ prompt: 0, completion: 0 }), undefined)
  assert.equal(resolveModelPricing("totally-unknown-model", { prompt: 0, completion: 0 }), undefined)
})

test("parseUsageCostUsd accepts numeric strings from providers", () => {
  assert.equal(parseUsageCostUsd(0.0123), 0.0123)
  assert.equal(parseUsageCostUsd("0.0123"), 0.0123)
  assert.equal(parseUsageCostUsd("nope"), undefined)
  assert.equal(parseUsageCostUsd(undefined), undefined)
})
