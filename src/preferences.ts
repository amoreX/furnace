import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type TypingIndicatorStyle = "block" | "underscore" | "bar"
export type TerminalLayout = "classic" | "notebook" | "console" | "asteroid"
export type RepoIndexPolicy = "agent-decides" | "every-git-push"
export type CostDisplayMode = "session" | "total" | "off"

const TERMINAL_LAYOUTS = new Set<TerminalLayout>(["classic", "notebook", "console", "asteroid"])
const PROJECT_PREFERENCE_KEYS = new Set<keyof FurnacePreferences>(["model", "modelSettings", "theme"])
const writeQueues = new Map<string, Promise<unknown>>()
let temporaryFileCounter = 0

export function normalizeTerminalLayout(value: string | undefined): TerminalLayout {
  return value && TERMINAL_LAYOUTS.has(value as TerminalLayout) ? value as TerminalLayout : "classic"
}

export function normalizeRepoIndexPolicy(value: string | undefined): RepoIndexPolicy {
  return value === "every-git-push" ? value : "agent-decides"
}

export function normalizeCostDisplayMode(value: string | undefined, legacyShowCost?: boolean): CostDisplayMode {
  if (value === "total" || value === "off" || value === "session") return value
  return legacyShowCost === false ? "off" : "session"
}

export function normalizeAcknowledgedReleaseVersions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((version): version is string => (
    typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version)
  )))]
}

export type FurnacePreferences = {
  acknowledgedReleaseVersions?: string[]
  layout?: TerminalLayout
  model?: string
  modelSettings?: ModelSettings
  notifications?: boolean
  pinnedChatIds?: string[]
  provider?: string
  repoIndexPolicy?: RepoIndexPolicy
  skillPaths?: string[]
  statusShowAppName?: boolean
  statusShowContext?: boolean
  statusShowContextPercent?: boolean
  statusContextMode?: "off" | "tokens" | "tokens-percent" | "percent"
  statusCostMode?: CostDisplayMode
  /** @deprecated Read for migration; new writes use statusCostMode. */
  statusShowCost?: boolean
  statusShowCwd?: boolean
  statusShowFast?: boolean
  statusShowForkParent?: boolean
  statusShowMode?: boolean
  statusShowModel?: boolean
  statusShowReasoning?: boolean
  statusShowTheme?: boolean
  statusShowTitle?: boolean
  statusShowWindow?: boolean
  theme?: string
  typingIndicatorBlink?: boolean
  typingIndicator?: TypingIndicatorStyle
}

export type StatusLinePreferences = Pick<FurnacePreferences,
  | "statusShowAppName"
  | "statusShowContext"
  | "statusShowContextPercent"
  | "statusContextMode"
  | "statusCostMode"
  | "statusShowCost"
  | "statusShowCwd"
  | "statusShowFast"
  | "statusShowForkParent"
  | "statusShowMode"
  | "statusShowModel"
  | "statusShowReasoning"
  | "statusShowTheme"
  | "statusShowTitle"
  | "statusShowWindow"
>

export function statusLinePreferencesFrom(preferences: FurnacePreferences): StatusLinePreferences {
  return {
    statusShowAppName: preferences.statusShowAppName,
    statusShowContext: preferences.statusShowContext,
    statusShowContextPercent: preferences.statusShowContextPercent,
    statusContextMode: preferences.statusContextMode,
    statusCostMode: normalizeCostDisplayMode(preferences.statusCostMode, preferences.statusShowCost),
    statusShowCost: preferences.statusShowCost,
    statusShowCwd: preferences.statusShowCwd,
    statusShowFast: preferences.statusShowFast,
    statusShowForkParent: preferences.statusShowForkParent,
    statusShowMode: preferences.statusShowMode,
    statusShowModel: preferences.statusShowModel,
    statusShowReasoning: preferences.statusShowReasoning,
    statusShowTheme: preferences.statusShowTheme,
    statusShowTitle: preferences.statusShowTitle,
    statusShowWindow: preferences.statusShowWindow,
  }
}

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh"

export const defaultMaxOutputTokens = 8192

export type ModelSettings = {
  contextLength?: number
  maxOutputTokens?: number
  reasoningEffort?: ReasoningEffort
  fast?: boolean
}

async function readPreferencesFile(filePath: string): Promise<FurnacePreferences> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as FurnacePreferences : {}
  } catch {
    return {}
  }
}

export async function loadPreferences(cwd = process.cwd()): Promise<FurnacePreferences> {
  const globalPrefs = await readPreferencesFile(globalPreferencesPath())
  const projectPrefs = projectPreferenceOverrides(await readPreferencesFile(preferencesPath(cwd)))
  const preferences = Object.assign({}, globalPrefs, projectPrefs)
  preferences.acknowledgedReleaseVersions = normalizeAcknowledgedReleaseVersions(preferences.acknowledgedReleaseVersions)
  return preferences
}

export async function saveGlobalPreferences(update: FurnacePreferences): Promise<void> {
  const path = globalPreferencesPath()
  await updatePreferencesFile(path, (preferences) => Object.assign(preferences, update))
}

export async function acknowledgeReleaseVersion(version: string): Promise<void> {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid Furnace release version: ${version}`)
  const path = globalPreferencesPath()
  await updatePreferencesFile(path, (preferences) => ({
    ...preferences,
    acknowledgedReleaseVersions: normalizeAcknowledgedReleaseVersions([
      ...normalizeAcknowledgedReleaseVersions(preferences.acknowledgedReleaseVersions),
      version,
    ]),
  }))
}

function globalPreferencesPath(): string {
  return join(homedir(), ".furnace", "preferences.json")
}

export async function saveModelPreference(cwd: string, model: string): Promise<void> {
  await saveModelPreferences(cwd, { model })
}

export async function saveModelPreferences(cwd: string, update: FurnacePreferences): Promise<void> {
  const path = preferencesPath(cwd)
  const projectUpdate = projectPreferenceOverrides(update)
  await updatePreferencesFile(path, (preferences) => Object.assign(projectPreferenceOverrides(preferences), projectUpdate))
}

export async function saveThemePreference(cwd: string, theme: string): Promise<void> {
  await saveModelPreferences(cwd, { theme })
}

function preferencesPath(cwd: string): string {
  return join(cwd, ".furnace", "preferences.json")
}

function projectPreferenceOverrides(preferences: FurnacePreferences): FurnacePreferences {
  return Object.fromEntries(
    Object.entries(preferences).filter(([key]) => PROJECT_PREFERENCE_KEYS.has(key as keyof FurnacePreferences)),
  ) as FurnacePreferences
}

async function updatePreferencesFile(
  path: string,
  update: (preferences: FurnacePreferences) => FurnacePreferences,
): Promise<void> {
  await enqueueFileOperation(path, async () => {
    const preferences = update(await readPreferencesFile(path))
    await writeJsonAtomic(path, preferences)
  })
}

async function enqueueFileOperation<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(path) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(operation)
  writeQueues.set(path, next)
  try {
    return await next
  } finally {
    if (writeQueues.get(path) === next) writeQueues.delete(path)
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  temporaryFileCounter += 1
  const temporaryPath = `${path}.${process.pid}.${temporaryFileCounter}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {})
  }
}
