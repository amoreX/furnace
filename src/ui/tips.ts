export type FurnaceTip = {
  command: string
  description: string
}

export const IDLE_TIP_VISIBLE_MS = 5000
export const IDLE_TIP_INTERVAL_MS = 10_000

export const furnaceTips: readonly FurnaceTip[] = [
  { command: "/fork", description: "branch from the current conversation at any prompt" },
  { command: "/lofi", description: "toggle background music while you work" },
  { command: "/caveman", description: "make user-facing replies primitive, blunt, and short" },
  { command: "/stfu", description: "minimize narration and keep replies extremely concise" },
  { command: "/pins", description: "jump between your pinned conversations" },
  { command: "Tab in /resume", description: "pin or unpin the highlighted conversation" },
  { command: "/init", description: "learn the current repository and create its local index" },
  { command: "/theme", description: "browse and preview Furnace themes" },
  { command: "Cost in /settings", description: "show per-session cost, total key cost, or hide cost entirely" },
  { command: "Tips in /settings", description: "turn these rotating idle tips on or off" },
  { command: "/usage", description: "view token usage, cost, streaks, and accepted lines" },
  { command: "/change", description: "reopen the latest Furnace release notes" },
]

export type TipSchedulerOptions = {
  enabled: boolean
  hideAfterMs?: number
  isEligible: () => boolean
  maxWaitMs?: number
  minWaitMs?: number
  random?: () => number
  setTip: (tip?: FurnaceTip) => void
  tips?: readonly FurnaceTip[]
}

export class TipScheduler {
  private enabled: boolean
  private readonly hideAfterMs: number
  private lastCommand?: string
  private readonly maxWaitMs: number
  private readonly minWaitMs: number
  private readonly options: TipSchedulerOptions
  private timer?: ReturnType<typeof setTimeout>

  constructor(options: TipSchedulerOptions) {
    this.options = options
    this.enabled = options.enabled
    this.hideAfterMs = options.hideAfterMs ?? IDLE_TIP_VISIBLE_MS
    this.minWaitMs = options.minWaitMs ?? IDLE_TIP_INTERVAL_MS
    this.maxWaitMs = options.maxWaitMs ?? IDLE_TIP_INTERVAL_MS
  }

  start(): void {
    this.scheduleNext()
  }

  stop(): void {
    this.clearTimer()
    this.options.setTip(undefined)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.stop()
    if (enabled) this.scheduleNext()
  }

  activity(): void {
    if (!this.enabled) return
    this.stop()
    this.scheduleNext()
  }

  refresh(): void {
    if (!this.enabled || this.options.isEligible()) return
    this.activity()
  }

  private scheduleNext(): void {
    if (!this.enabled || this.timer) return
    const random = this.options.random ?? Math.random
    const span = Math.max(0, this.maxWaitMs - this.minWaitMs)
    const waitMs = this.minWaitMs + Math.floor(random() * (span + 1))
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.enabled || !this.options.isEligible()) {
        this.scheduleNext()
        return
      }
      const tip = pickTip(this.options.tips ?? furnaceTips, this.lastCommand, random)
      if (!tip) {
        this.scheduleNext()
        return
      }
      this.lastCommand = tip.command
      this.options.setTip(tip)
      this.timer = setTimeout(() => {
        this.timer = undefined
        this.options.setTip(undefined)
        this.scheduleNext()
      }, this.hideAfterMs)
      this.timer.unref?.()
    }, waitMs)
    this.timer.unref?.()
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = undefined
  }
}

export function pickTip(
  tips: readonly FurnaceTip[],
  lastCommand: string | undefined,
  random: () => number = Math.random,
): FurnaceTip | undefined {
  const candidates = tips.length > 1 ? tips.filter((tip) => tip.command !== lastCommand) : [...tips]
  if (candidates.length === 0) return undefined
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]
}
