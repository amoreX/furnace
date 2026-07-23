import type { TokenPricing } from "./usage-cost.js"

/** Published direct-provider USD rates per 1M tokens. */
const PER_MILLION_USD: Record<string, TokenPricing> = {
  "claude-haiku-4-5": { prompt: 1, cacheRead: 0.1, cacheWrite: 1.25, completion: 5 },
  "claude-opus-4-6": { prompt: 5, cacheRead: 0.5, cacheWrite: 6.25, completion: 25 },
  "claude-opus-4-7": { prompt: 5, cacheRead: 0.5, cacheWrite: 6.25, completion: 25 },
  "claude-opus-4-8": { prompt: 5, cacheRead: 0.5, cacheWrite: 6.25, completion: 25 },
  "claude-sonnet-4-5": { prompt: 3, cacheRead: 0.3, cacheWrite: 3.75, completion: 15 },
  "claude-sonnet-4-6": { prompt: 3, cacheRead: 0.3, cacheWrite: 3.75, completion: 15 },
  "deepseek-v4-flash": { prompt: 0.14, cacheRead: 0.0028, completion: 0.28 },
  "deepseek-v4-pro": { prompt: 0.435, cacheRead: 0.003625, completion: 0.87 },
  // Legacy aliases currently route to V4 Flash.
  "deepseek-chat": { prompt: 0.14, cacheRead: 0.0028, completion: 0.28 },
  "deepseek-reasoner": { prompt: 0.14, cacheRead: 0.0028, completion: 0.28 },
  "gpt-4.1": { prompt: 2, cacheRead: 0.5, completion: 8 },
  "gpt-4.1-mini": { prompt: 0.4, cacheRead: 0.1, completion: 1.6 },
  "gpt-4.1-nano": { prompt: 0.1, cacheRead: 0.025, completion: 0.4 },
  "gpt-4o": { prompt: 2.5, cacheRead: 1.25, completion: 10 },
  "gpt-4o-mini": { prompt: 0.15, cacheRead: 0.075, completion: 0.6 },
  "gpt-5": { prompt: 1.25, cacheRead: 0.125, completion: 10 },
  "gpt-5-mini": { prompt: 0.25, cacheRead: 0.025, completion: 2 },
  "gpt-5-nano": { prompt: 0.05, cacheRead: 0.005, completion: 0.4 },
}

export function perMillionToPerToken(pricing: TokenPricing): TokenPricing {
  return {
    ...(pricing.cacheRead === undefined ? {} : { cacheRead: pricing.cacheRead / 1_000_000 }),
    ...(pricing.cacheWrite === undefined ? {} : { cacheWrite: pricing.cacheWrite / 1_000_000 }),
    prompt: pricing.prompt / 1_000_000,
    completion: pricing.completion / 1_000_000,
  }
}

export function normalizeTokenPricing(pricing?: Partial<TokenPricing> | null): TokenPricing | undefined {
  if (!pricing) return undefined
  const prompt = Number(pricing.prompt)
  const completion = Number(pricing.completion)
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return undefined
  if (prompt <= 0 && completion <= 0) return undefined
  const cacheRead = optionalPrice(pricing.cacheRead)
  const cacheWrite = optionalPrice(pricing.cacheWrite)
  return {
    ...(cacheRead === undefined ? {} : { cacheRead }),
    ...(cacheWrite === undefined ? {} : { cacheWrite }),
    prompt,
    completion,
  }
}

export function catalogPricingForModel(modelId: string): TokenPricing | undefined {
  const id = modelId.trim().toLowerCase()
  if (!id) return undefined
  const rawBare = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id
  const bare = rawBare.replace(/(\d)\.(\d)/g, "$1-$2")
  const match = PER_MILLION_USD[bare]
    || Object.entries(PER_MILLION_USD)
      .sort(([left], [right]) => right.length - left.length)
      .find(([prefix]) => bare.startsWith(`${prefix}-`))?.[1]
  return match ? perMillionToPerToken(match) : undefined
}

export function resolveModelPricing(
  modelId: string,
  apiPricing?: Partial<TokenPricing> | null,
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

function optionalPrice(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}
