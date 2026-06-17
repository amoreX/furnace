import readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

const colors = {
  accent: "\x1b[38;5;149m",
  border: "\x1b[38;5;67m",
  dim: "\x1b[2m",
  error: "\x1b[38;5;203m",
  reset: "\x1b[0m",
  text: "\x1b[38;5;252m",
  title: "\x1b[1m",
}

export type PromptContext = {
  cwd: string
  model: string
}

type Layout = {
  inputTop: number
  responseBottom: number
  responseTop: number
  rows: number
  width: number
}

let activeLayout: Layout | undefined
let activeContext: PromptContext | undefined

export function clearScreen(): void {
  output.write("\x1b[2J\x1b[H")
}

export function renderHeader(context: PromptContext): void {
  activeLayout = getLayout()
  activeContext = context

  renderTitle(activeLayout)
  renderInputPanel(context, activeLayout)
}

export async function readPrompt(context: PromptContext): Promise<string> {
  renderHeader(context)

  const rl = readline.createInterface({ input, output })
  const layout = activeLayout || getLayout()
  const prompt = await rl.question(`${moveTo(layout.inputTop + 1, 5)}${colors.accent}>${colors.reset} `)
  rl.close()

  return prompt.trim()
}

export function renderAssistantStart(prompt?: string): void {
  if (!activeLayout || !activeContext) {
    if (prompt) renderUserBlock(prompt)
    output.write(`\n${colors.border}─ response ${"─".repeat(50)}${colors.reset}\n\n`)
    return
  }

  clearResponseArea(activeLayout)
  renderInputPanel(activeContext, activeLayout)
  output.write(setScrollRegion(activeLayout.responseTop, activeLayout.responseBottom))
  output.write(moveTo(activeLayout.responseTop, 1))

  if (prompt) {
    renderUserBlock(prompt, activeLayout.width)
    output.write("\n")
  }

  output.write(`${colors.border}─ response ${"─".repeat(Math.min(50, activeLayout.width - 12))}${colors.reset}\n\n`)
}

export function renderAssistantToken(token: string): void {
  output.write(token)
}

export function renderDone(): void {
  output.write(`\n\n${colors.dim}done${colors.reset}\n`)

  if (activeLayout) {
    output.write(resetScrollRegion())
    output.write(moveTo(activeLayout.rows, 1))
    output.write("\n")
  }
}

export function renderError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  output.write(resetScrollRegion())
  output.write(`\n${colors.error}error:${colors.reset} ${message}\n`)
}

function renderTitle(layout: Layout): void {
  const label = " Furnace "
  const ruleWidth = Math.max(0, layout.width - label.length)
  const left = Math.floor(ruleWidth / 2)
  const right = ruleWidth - left

  output.write(moveTo(1, 1))
  output.write(`${colors.accent}${"─".repeat(left)}${colors.reset}`)
  output.write(`${colors.title}${colors.text}${label}${colors.reset}`)
  output.write(`${colors.accent}${"─".repeat(right)}${colors.reset}`)
}

function renderInputPanel(context: PromptContext, layout: Layout): void {
  const width = layout.width
  const cwd = shortenHome(context.cwd)
  const status = "0.0%/1.0M (auto)"
  const model = context.model

  output.write(moveTo(layout.inputTop, 1))
  output.write(`${colors.border}${"─".repeat(width)}${colors.reset}`)
  output.write(moveTo(layout.inputTop + 1, 1))
  output.write(`${colors.text}│${colors.reset}${" ".repeat(width - 1)}`)
  output.write(moveTo(layout.inputTop + 2, 1))
  output.write(`${colors.border}${"─".repeat(width)}${colors.reset}`)
  output.write(moveTo(layout.inputTop + 3, 1))
  output.write(`${colors.dim}${truncate(cwd, width)}${colors.reset}${clearToEndOfLine()}`)
  output.write(moveTo(layout.inputTop + 4, 1))
  output.write(`${colors.dim}${status}${colors.reset}${colors.dim}${alignRight(model, width - status.length)}${colors.reset}`)
  output.write(clearToEndOfLine())
}

function renderUserBlock(prompt: string, width = Math.max(60, output.columns || 80)): void {
  output.write(`${colors.accent}> user ${colors.border}${"─".repeat(Math.max(0, width - 8))}${colors.reset}\n\n`)
  output.write(`${prompt}\n`)
}

function clearResponseArea(layout: Layout): void {
  for (let row = 2; row <= layout.responseBottom; row += 1) {
    output.write(moveTo(row, 1))
    output.write(clearLine())
  }
}

function getLayout(): Layout {
  const width = Math.max(60, output.columns || 80)
  const rows = Math.max(14, output.rows || 24)
  const inputHeight = 5
  const inputTop = Math.max(5, rows - inputHeight + 1)
  const responseTop = 3
  const responseBottom = Math.max(responseTop, inputTop - 2)

  return {
    inputTop,
    responseBottom,
    responseTop,
    rows,
    width,
  }
}

function shortenHome(path: string): string {
  const home = process.env.HOME
  if (!home) return path
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

function alignRight(value: string, available: number): string {
  return `${" ".repeat(Math.max(1, available - value.length))}${value}`
}

function truncate(value: string, width: number): string {
  if (value.length <= width) return value
  if (width <= 1) return value.slice(0, width)
  return `…${value.slice(value.length - width + 1)}`
}

function moveTo(row: number, column: number): string {
  return `\x1b[${row};${column}H`
}

function clearLine(): string {
  return "\x1b[2K"
}

function clearToEndOfLine(): string {
  return "\x1b[0K"
}

function setScrollRegion(top: number, bottom: number): string {
  return `\x1b[${top};${bottom}r`
}

function resetScrollRegion(): string {
  return "\x1b[r"
}
