import { Container, type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui"
import { normalizeTerminalLayout, type StatusLinePreferences, type TerminalLayout } from "../../preferences.js"
import { theme } from "./theme.js"

export type LayoutOption = {
  description: string
  label: string
  value: TerminalLayout
}

export const LAYOUT_OPTIONS: readonly LayoutOption[] = [
  { value: "classic", label: "Classic", description: "The familiar banner → transcript → composer flow" },
  { value: "notebook", label: "Notebook", description: "An editorial, labelled conversation log" },
  { value: "console", label: "Console", description: "Operator console with top telemetry and a bottom command deck" },
  { value: "asteroid", label: "Asteroid", description: "Asteroids drifting in the void · moon-surface chat input" },
] as const

// ---------------------------------------------------------------------------
// Asteroid layout helpers
// ---------------------------------------------------------------------------

/** Seeded pseudo-random — stable per-width asteroid fields without Math.random(). */
function seededRand(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

const ASTEROID_GLYPHS = ["◆", "◇", "▪", "●", "○", "◉", "·", "✦", "✧", "⬡", "⬢", "⬟", "◈", "*", "·", "·", "·"]

/** Render one row of space with scattered asteroid glyphs at `density` (0–1). */
function asteroidRow(width: number, density: number, seed: number): string {
  const rand = seededRand(seed)
  const chars: string[] = []
  for (let i = 0; i < width; i++) {
    const r = rand()
    if (r < density) {
      const glyph = ASTEROID_GLYPHS[Math.floor(rand() * ASTEROID_GLYPHS.length)]!
      chars.push(theme.fg("dim", glyph))
    } else {
      chars.push(" ")
    }
  }
  return chars.join("")
}

/** Moon surface horizon: a jagged cratered terrain using block elements. */
export function moonSurface(width: number): string {
  const TERRAIN = "▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂▁"
  let result = ""
  for (let i = 0; i < width; i++) {
    result += TERRAIN[i % TERRAIN.length]
  }
  return theme.fg("muted", result)
}

export type LayoutLiveState = {
  context?: { tokens: number; window: number }
  costUsd?: number
  cwd: string
  layout: TerminalLayout
  mode: "agent" | "plan"
  model: string
  statusLine?: StatusLinePreferences
  themeName: string
  title: string
  version: string
}

type LayoutStateReader = () => LayoutLiveState

function horizontalRule(width: number, left = "", fill = "─", right = ""): string {
  return left + fill.repeat(Math.max(0, width - visibleWidth(left) - visibleWidth(right))) + right
}

function rightAligned(left: string, right: string, width: number): string {
  const clippedRight = truncateToWidth(right, width, "…")
  const available = Math.max(0, width - visibleWidth(clippedRight) - (left ? 1 : 0))
  const clippedLeft = truncateToWidth(left, available, "…")
  const gap = Math.max(0, width - visibleWidth(clippedLeft) - visibleWidth(clippedRight))
  return clippedLeft + " ".repeat(gap) + clippedRight
}

function showPart(state: LayoutLiveState, key: keyof StatusLinePreferences): boolean {
  return state.statusLine?.[key] !== false
}

const ASCII_WIDE = [
  "███████╗██╗   ██╗██████╗ ███╗   ██╗███████╗ ██████╗███████╗",
  "██╔════╝██║   ██║██╔══██╗████╗  ██║██╔════╝██╔════╝██╔════╝",
  "█████╗  ██║   ██║██████╔╝██╔██╗ ██║███████╗██║     █████╗  ",
  "██╔══╝  ██║   ██║██╔══██╗██║╚██╗██║██╔══██║██║     ██╔══╝  ",
  "██║     ╚██████╔╝██║  ██║██║ ╚████║██║  ██║╚██████╗███████╗",
  "╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝╚══════╝",
]

function asciiMark(width: number): string[] {
  if (width >= 65) return ASCII_WIDE.map((row) => theme.bold(theme.fg("accent", row)))
  return [theme.bold(theme.fg("accent", "FURNACE"))]
}

const EARLY_ACCESS_MESSAGE = "EARLY STAGES · OPEN AN ISSUE IF SOMETHING FEELS OFF"
const ISSUE_URL = "https://github.com/amoreX/furnace/issues"
export const COMPACT_STARTUP_HINT = "ctrl+c interrupt/close · / commands"

function earlyAccessBanner(width: number): string {
  const full = `${EARLY_ACCESS_MESSAGE} · ${ISSUE_URL}`
  const compact = `EARLY STAGES · ${ISSUE_URL}`
  const content = visibleWidth(full) <= width - 4 ? full : compact
  const label = theme.bold(theme.fg("accent", ` ${content}`))
  return truncateToWidth(label, width, "…")
}

export class LayoutHeaderComponent implements Component {
  private expanded = false

  constructor(private readonly readState: LayoutStateReader) {}

  invalidate(): void {}

  setExpanded(expanded: boolean): void {
    this.expanded = expanded
  }

  render(width: number): string[] {
    const state = this.readState()
    switch (state.layout) {
      case "console":
        return [
          "",
          ...(showPart(state, "statusShowAppName") ? asciiMark(width) : []),
          earlyAccessBanner(width),
          "",
          theme.fg("accent", horizontalRule(width, showPart(state, "statusShowAppName") ? "╔═[ OPERATOR CONSOLE ]" : "╔═", "═", "╗")),
          rightAligned(
            showPart(state, "statusShowCwd") ? theme.fg("muted", `║ ${state.cwd}`) : "║",
            showPart(state, "statusShowMode") ? theme.fg("accent", `${state.mode.toUpperCase()} ║`) : "║",
            width,
          ),
        ]
      case "asteroid": {
        const field1 = asteroidRow(width, 0.04, width * 7 + 1)
        const field2 = asteroidRow(width, 0.03, width * 13 + 2)
        const field3 = asteroidRow(width, 0.05, width * 19 + 3)
        const mark = asciiMark(width)
        return [
          "",
          field1,
          ...mark,
          earlyAccessBanner(width),
          field2,
          rightAligned(theme.fg("dim", `v${state.version}`), theme.fg("dim", state.title), width),
          field3,
          "",
        ]
      }
      case "notebook":
        return [
          "",
          ...(showPart(state, "statusShowAppName") ? asciiMark(width) : []),
          earlyAccessBanner(width),
          rightAligned(
            theme.fg("dim", `v${state.version}`),
            showPart(state, "statusShowTitle") ? theme.fg("dim", `№ ${state.title}`) : "",
            width,
          ),
          "",
        ]
      case "classic":
      default: {
        const mark = showPart(state, "statusShowAppName") ? asciiMark(width).map((row) => ` ${row}`) : []
        return [
          "",
          ...mark,
          earlyAccessBanner(width),
          "",
          ` ${theme.fg("dim", `v${state.version}`)}`,
          ` ${theme.fg("muted", COMPACT_STARTUP_HINT)}`,
          "",
        ]
      }
    }
  }
}

export class LayoutTranscriptSurface extends Container {
  constructor(
    private readonly transcript: Component,
    private readonly readState: LayoutStateReader,
  ) {
    super()
    this.addChild(transcript)
  }

  override render(width: number): string[] {
    const lines = this.transcript.render(width)
    if (lines.length > 0) return lines
    const state = this.readState()
    switch (state.layout) {
      case "console":
        return [
          theme.fg("dim", "[00:00:00] BOOT  runtime initialized"),
          theme.fg("success", "[00:00:01] READY awaiting operator input"),
          theme.fg("dim", `[workspace] ${state.cwd}`),
          "",
        ]
      case "asteroid":
        return [
          "",
          asteroidRow(width, 0.04, width * 31 + 5),
          theme.fg("dim", " The void awaits. Speak into the dark."),
          asteroidRow(width, 0.03, width * 37 + 7),
          "",
        ]
      case "notebook":
        return [
          "",
          theme.fg("dim", "ENTRY 00"),
          theme.fg("border", horizontalRule(width, "", "─")),
          theme.fg("muted", "This field note is empty. Write the first instruction below."),
          "",
        ]
      case "classic":
      default:
        return [
          theme.fg("dim", " Ready when you are — describe a task, ask a question, or type / for commands."),
          "",
        ]
    }
  }
}

export type TranscriptItemKind = "assistant" | "tool" | "user"

export class LayoutTranscriptItem extends Container {
  constructor(
    private readonly content: Component,
    private readonly kind: TranscriptItemKind,
    private readonly readLayout: () => TerminalLayout,
  ) {
    super()
    this.addChild(content)
  }

  setExpanded(expanded: boolean): void {
    const candidate = this.content as Component & { setExpanded?: (value: boolean) => void }
    candidate.setExpanded?.(expanded)
  }

  override render(width: number): string[] {
    const layout = this.readLayout()
    const inset = layout === "console" || layout === "asteroid" ? 2 : 0
    const lines = this.content.render(Math.max(1, width - inset))

    if (layout === "classic") return lines

    if (layout === "asteroid") {
      const label = this.kind === "user" ? "✦ YOU" : this.kind === "assistant" ? "◉ FURNACE" : "◆ TOOL"
      return [
        theme.fg("dim", "· ".repeat(Math.floor(width / 2)).slice(0, width)),
        theme.bold(theme.fg(this.kind === "user" ? "accent" : "muted", ` ${label}`)),
        ...lines.map((line) => `  ${line}`),
      ]
    }

    if (layout === "notebook") {
      const label = this.kind === "user" ? "YOU" : this.kind === "assistant" ? "FURNACE" : "TOOL LOG"
      return [
        theme.fg("dim", horizontalRule(width, "", "·")),
        theme.bold(theme.fg(this.kind === "user" ? "accent" : "muted", label)),
        ...lines,
      ]
    }

    if (layout === "console") {
      const label = this.kind === "user" ? "INPUT" : this.kind === "assistant" ? "OUTPUT" : "PROCESS"
      return [
        theme.fg("border", `├─ ${label}`),
        ...lines.map((line) => `${theme.fg("border", "│")} ${line}`),
      ]
    }

    return lines
  }
}
