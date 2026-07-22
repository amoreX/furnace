import type { TokenPricing } from "./usage-cost.js"

/** Official-ish USD per 1M tokens (cache-miss input / output). */
const PER_MILLION_USD: Record<string, { prompt: number; completion: number }> = {
  "deepseek-v4-flash": { prompt: 0.14, completion: 0.28 },
  "deepseek-v4-pro": { prompt: 0.435, completion: 0.87 },
  // Legacy aliases currently route to V4 Flash.
  "deepseek-chat": { prompt: 0.14, completion: 0.28 },
  "deepseek-reasoner": { prompt: 0.14, completion: 0.28 },
}

export function perMillionToPerToken(pricing: { prompt: number; completion: number }): TokenPricing {
  return {
    prompt: pricing.prompt / 1_000_000,
    completion: pricing.completion / 1_000_000,
  }
}

export function normalizeTokenPricing(pricing?: { prompt?: number; completion?: number } | null): TokenPricing | undefined {
  if (!pricing) return undefined
  const prompt = Number(pricing.prompt)
  const completion = Number(pricing.completion)
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return undefined
  if (prompt <= 0 && completion <= 0) return undefined
  return { prompt, completion }
}

export function catalogPricingForModel(modelId: string): TokenPricing | undefined {
  const id = modelId.trim().toLowerCase()
  if (!id) return undefined
  const bare = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id
  const match = PER_MILLION_USD[bare] || PER_MILLION_USD[id]
  return match ? perMillionToPerToken(match) : undefined
}

export function resolveModelPricing(
  modelId: string,
  apiPricing?: { prompt?: number; completion?: number } | null,
): TokenPricing | undefined {
  return normalizeTokenPricing(apiPricing) || catalogPricingForModel(modelId)
}

export function parseUsageCostUsd(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}
