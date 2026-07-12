import { Container, type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui"
import { normalizeTerminalLayout, type TerminalLayout } from "../../preferences.js"
import { theme } from "./theme.js"

export type LayoutOption = {
  description: string
  label: string
  value: TerminalLayout
}

export const LAYOUT_OPTIONS: readonly LayoutOption[] = [
  { value: "classic", label: "Classic", description: "The familiar banner → transcript → composer flow" },
  { value: "focus", label: "Focus", description: "A stripped-back writing surface with almost no chrome" },
  { value: "forge", label: "Forge", description: "A wide command center with a live session sidecar" },
  { value: "console", label: "Console", description: "Operator console with top telemetry and a bottom command deck" },
  { value: "notebook", label: "Notebook", description: "An editorial, labelled conversation log" },
  { value: "signal", label: "Signal", description: "A broadcast desk with transmission-style framing" },
] as const

export type LayoutLiveState = {
  context?: { tokens: number; window: number }
  costUsd?: number
  cwd: string
  layout: TerminalLayout
  mode: "agent" | "plan"
  model: string
  themeName: string
  title: string
  version: string
}

type LayoutStateReader = () => LayoutLiveState

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`
  return String(value)
}

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

function contextLabel(state: LayoutLiveState): string {
  if (!state.context || state.context.window <= 0) return "ctx —"
  const percent = Math.round((state.context.tokens / state.context.window) * 100)
  return `ctx ${percent}%`
}

function projectLabel(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) || cwd
}

function centered(content: string, width: number): string {
  const clipped = truncateToWidth(content, width, "…")
  return " ".repeat(Math.max(0, Math.floor((width - visibleWidth(clipped)) / 2))) + clipped
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
      case "focus":
        return [
          "",
          rightAligned(
            theme.bold(theme.fg("accent", state.title)),
            theme.fg("dim", `${state.mode} · ${state.model.split("/").at(-1)}`),
            width,
          ),
          "",
        ]
      case "forge": {
        const tag = theme.bg("toolPendingBg", theme.bold(theme.fg("accent", " FURNACE / FORGE ")))
        return [
          horizontalRule(width, "┏", "━", "┓"),
          rightAligned(`┃ ${tag}  ${theme.fg("muted", state.title)}`, theme.fg("dim", `v${state.version} ┃`), width),
          horizontalRule(width, "┣", "━", "┫"),
        ].map((line) => theme.fg("border", line))
      }
      case "console":
        return [
          theme.fg("accent", horizontalRule(width, "╔═[ OPERATOR CONSOLE ]", "═", "╗")),
          rightAligned(
            theme.fg("muted", `║ ${state.cwd}`),
            theme.fg("accent", `${state.mode.toUpperCase()} ║`),
            width,
          ),
        ]
      case "notebook":
        return [
          "",
          theme.bold(theme.fg("accent", "FURNACE")),
          rightAligned(theme.fg("muted", "FIELD NOTES / AGENT SESSION"), theme.fg("dim", `№ ${state.title}`), width),
          theme.fg("border", horizontalRule(width, "", "━")),
          "",
        ]
      case "signal":
        return [
          theme.fg("border", horizontalRule(width, "╭─", "─", "─╮")),
          rightAligned(
            `│ ${theme.bold(theme.fg("accent", "FURNACE FM"))} ${theme.fg("dim", "/ LIVE AGENT TRANSMISSION")}`,
            theme.fg("success", `● ON AIR  │`),
            width,
          ),
          theme.fg("border", horizontalRule(width, "╰─", "─", "─╯")),
        ]
      case "classic":
      default: {
        const wideBanner = [
          "███████╗██╗   ██╗██████╗ ███╗   ██╗███████╗ ██████╗███████╗",
          "██╔════╝██║   ██║██╔══██╗████╗  ██║██╔════╝██╔════╝██╔════╝",
          "█████╗  ██║   ██║██████╔╝██╔██╗ ██║███████╗██║     █████╗  ",
          "██╔══╝  ██║   ██║██╔══██╗██║╚██╗██║██╔══██║██║     ██╔══╝  ",
          "██║     ╚██████╔╝██║  ██║██║ ╚████║██║  ██║╚██████╗███████╗",
          "╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝╚══════╝",
        ]
        const mark = width >= 65
          ? wideBanner.map((row) => ` ${theme.bold(theme.fg("accent", row))}`)
          : [` ${theme.bold(theme.fg("accent", "FURNACE"))}`]
        const hints = this.expanded
          ? ["ctrl+c interrupt / clear", "ctrl+d exit", "ctrl+o expand tools", "/ commands", "drop files to attach"]
          : ["ctrl+c interrupt · / commands · ctrl+o more"]
        return ["", ...mark, "", ` ${theme.fg("dim", `v${state.version}`)}`, ...hints.map((hint) => ` ${theme.fg("muted", hint)}`), ""]
      }
    }
  }
}

export class LayoutRailComponent implements Component {
  constructor(private readonly readState: LayoutStateReader) {}

  invalidate(): void {}

  render(width: number): string[] {
    const state = this.readState()
    const model = state.model.split("/").at(-1) || state.model
    if (state.layout === "focus") {
      return [theme.fg("dim", rightAligned(`${state.mode} · ${contextLabel(state)}`, model, width))]
    }
    if (state.layout === "signal") {
      return [
        theme.fg("border", horizontalRule(width, "├─", "─", "─┤")),
        rightAligned(
          `│ CH 01 · ${state.mode.toUpperCase()} · ${contextLabel(state)}`,
          `${model} · ${state.themeName} │`,
          width,
        ),
      ]
    }
    return []
  }
}

export class ForgeSidecarComponent implements Component {
  constructor(private readonly readState: LayoutStateReader) {}

  invalidate(): void {}

  render(width: number): string[] {
    const state = this.readState()
    const context = state.context
    const ratio = context?.window ? Math.min(1, context.tokens / context.window) : 0
    const meterWidth = Math.max(8, width - 4)
    const filled = Math.round(meterWidth * ratio)
    const meter = theme.fg(ratio > 0.8 ? "warning" : "accent", "█".repeat(filled)) + theme.fg("dim", "░".repeat(meterWidth - filled))
    const percent = context?.window ? `${Math.round(ratio * 100)}%` : "—"
    const rows = [
      rightAligned(theme.bold(theme.fg("accent", "SESSION MATRIX")), theme.fg("success", "● READY"), width),
      theme.fg("border", horizontalRule(width, "", "─")),
      rightAligned(theme.fg("dim", "MODE"), state.mode.toUpperCase(), width),
      rightAligned(theme.fg("dim", "PROJECT"), projectLabel(state.cwd), width),
      "",
      theme.fg("dim", "MODEL"),
      state.model.split("/").at(-1) || state.model,
      "",
      rightAligned(theme.fg("dim", "CONTEXT"), percent, width),
      meter,
      context ? `${compactNumber(context.tokens)} / ${compactNumber(context.window)}` : "awaiting telemetry",
      "",
      rightAligned(theme.fg("dim", "COST"), state.costUsd === undefined ? "—" : `$${state.costUsd.toFixed(4)}`, width),
      rightAligned(theme.fg("dim", "THEME"), state.themeName, width),
      theme.fg("border", horizontalRule(width, "", "─")),
      theme.fg("dim", "/ commands  ·  ctrl+o tools"),
    ]
    return rows.map((row) => truncateToWidth(row, width, "…"))
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
      case "focus":
        return [
          "",
          "",
          centered(theme.fg("dim", "Ask a question, name a file, or describe the change."), width),
          "",
        ]
      case "forge":
        return [
          "",
          theme.bold(theme.fg("accent", "  WORKSPACE ONLINE")),
          theme.fg("dim", `  ${state.cwd}`),
          "",
          `  ${theme.fg("muted", "Start a build")}`,
          `  ${theme.fg("dim", "Describe the outcome. Furnace will inspect, plan, and execute.")}`,
          "",
          `  ${theme.fg("muted", "Quick controls")}`,
          `  ${theme.fg("dim", "/model  /settings  /plan  /resume")}`,
        ]
      case "console":
        return [
          theme.fg("dim", "[00:00:00] BOOT  runtime initialized"),
          theme.fg("success", "[00:00:01] READY awaiting operator input"),
          theme.fg("dim", `[workspace] ${state.cwd}`),
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
      case "signal":
        return [
          "",
          centered(theme.fg("dim", "· · ·  CHANNEL OPEN  · · ·"), width),
          centered(theme.fg("muted", "Awaiting your first transmission"), width),
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

export class SplitPaneComponent extends Container {
  constructor(
    private readonly main: Component,
    private readonly sidecar: Component,
  ) {
    super()
    this.addChild(main)
    this.addChild(sidecar)
  }

  override render(width: number): string[] {
    if (width < 100) return this.main.render(width)
    const gap = 3
    const sideWidth = Math.max(24, Math.min(34, Math.floor(width * 0.28)))
    const mainWidth = width - sideWidth - gap
    const mainLines = this.main.render(mainWidth)
    const sideLines = this.sidecar.render(sideWidth)
    const height = Math.max(mainLines.length, sideLines.length)
    const divider = theme.fg("border", "│")
    const lines: string[] = []
    for (let index = 0; index < height; index += 1) {
      const left = mainLines[index] ?? ""
      const right = sideLines[index] ?? ""
      lines.push(left + " ".repeat(Math.max(0, mainWidth - visibleWidth(left))) + ` ${divider} ` + right)
    }
    return lines
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
    const inset = layout === "focus" ? 4 : layout === "forge" || layout === "console" || layout === "signal" ? 2 : 0
    const lines = this.content.render(Math.max(1, width - inset))
    if (layout === "classic") return lines
    if (layout === "focus") {
      const marker = this.kind === "user" ? theme.fg("accent", "› ") : "  "
      return lines.map((line, index) => `  ${index === 0 ? marker : "  "}${line}`)
    }
    if (layout === "forge") {
      const label = this.kind === "user" ? "OPERATOR" : this.kind === "assistant" ? "FURNACE" : "TASK"
      const rail = this.kind === "user" ? theme.fg("accent", "┃") : theme.fg("border", "│")
      return [
        `${rail} ${theme.bold(theme.fg(this.kind === "user" ? "accent" : "muted", label))}`,
        ...lines.map((line) => `${rail} ${line}`),
      ]
    }
    if (layout === "console") {
      const label = this.kind === "user" ? "INPUT" : this.kind === "assistant" ? "OUTPUT" : "PROCESS"
      return [
        theme.fg("border", `├─ ${label}`),
        ...lines.map((line) => `${theme.fg("border", "│")} ${line}`),
      ]
    }
    if (layout === "notebook") {
      const label = this.kind === "user" ? "YOU" : this.kind === "assistant" ? "FURNACE" : "TOOL LOG"
      return [
        theme.bold(theme.fg(this.kind === "user" ? "accent" : "muted", label)),
        ...lines,
        theme.fg("dim", horizontalRule(width, "", "·")),
      ]
    }
    const label = this.kind === "user" ? "CALLER" : this.kind === "assistant" ? "FURNACE" : "CONTROL ROOM"
    return [
      theme.fg("border", horizontalRule(width, `╞═ ${label} `, "═", "═╡")),
      ...lines.map((line) => `${theme.fg("border", "│")} ${line}`),
    ]
  }
}
