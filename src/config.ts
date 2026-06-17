import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const currentDir = dirname(fileURLToPath(import.meta.url))
const promptPath = join(currentDir, "prompts", "base-system.md")

export type FurnaceConfig = {
  appName: string
  model: string
  openRouterApiKey: string
  siteUrl: string
  systemPrompt: string
}

export async function loadConfig(): Promise<FurnaceConfig> {
  dotenv.config({ quiet: true })

  const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim()

  if (!openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is missing. Add it to .env before running Furnace.")
  }

  return {
    appName: process.env.OPENROUTER_APP_NAME?.trim() || "Furnace",
    model: process.env.OPENROUTER_MODEL?.trim() || "anthropic/claude-sonnet-4.6",
    openRouterApiKey,
    siteUrl: process.env.OPENROUTER_SITE_URL?.trim() || "http://localhost",
    systemPrompt: await readFile(promptPath, "utf8"),
  }
}
