import * as Diff from "diff"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { FileSnapshot } from "../session/types.js"
import type { KeyUsageSummary } from "./store.js"

const dayMs = 24 * 60 * 60 * 1000
const intensity = ["·", "░", "▒", "▓", "█"] as const

export function acceptedLinesForTool(input: {
  args: string
  cwd: string
  snapshot?: FileSnapshot
  toolName: string
}): number {
  if (input.toolName === "edit") {
    try {
      const parsed = JSON.parse(input.args) as { patch?: unknown }
      if (typeof parsed.patch !== "string") return 0
      return parsed.patch.split(/\r?\n/).filter((line) => line.startsWith("+")).length
    } catch {
      return 0
    }
  }
  if (input.toolName !== "write" || !input.snapshot) return 0
  if (input.snapshot.existed && input.snapshot.previousContent === undefined) return 0
  try {
    const next = readFileSync(resolve(input.cwd, input.snapshot.path), "utf8")
    const previous = input.snapshot.previousContent ?? ""
    return Diff.diffLines(previous, next)
      .filter((part) => part.added)
      .reduce((total, part) => total + lineCount(part.value), 0)
  } catch {
    return 0
  }
}

export function renderUsageReport(summary: KeyUsageSummary, now = Date.now()): string {
  const end = startOfLocalDay(now)
  const start = addDays(end, -364)
  const values = new Map(summary.days.map((day) => [day.day, day.promptTokens + day.completionTokens]))
  const max = Math.max(0, ...values.values())
  const totalTokens = summary.promptTokens + summary.completionTokens
  const weeks: number[][] = []
  const gridStart = addDays(start, -start.getDay())
  const gridEnd = addDays(end, 6 - end.getDay())
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, day) => {
      const date = addDays(cursor, day)
      if (date < start || date > end) return -1
      return values.get(localDayKey(date)) ?? 0
    }))
  }

  const monthLabels = renderMonthLabels(gridStart, weeks.length)
  const rows = [1, 2, 3, 4, 5, 6, 0].map((day) => {
    const label = day === 1 ? "M" : day === 3 ? "W" : day === 5 ? "F" : " "
    return `${label} ${weeks.map((week) => cell(week[day] ?? -1, max)).join(" ")}`
  })
  const streaks = calculateStreaks(values, end)
  const unknown = summary.unknownCostTurns > 0 ? ` · ${summary.unknownCostTurns} unknown-cost turn${summary.unknownCostTurns === 1 ? "" : "s"}` : ""
  return [
    "Agent Usage",
    "Press Esc to close",
    "",
    "Tokens used (last 12 months)",
    totalTokens.toLocaleString(),
    "",
    `  ${monthLabels}`,
    ...rows,
    "",
    `Current streak: ${streaks.current} day${streaks.current === 1 ? "" : "s"}   Longest streak: ${streaks.longest} day${streaks.longest === 1 ? "" : "s"}`,
    "",
    `Less ${intensity.join(" ")} More`,
    "",
    `Recorded key cost (all time): ${formatCost(summary.costUsd)}${unknown}`,
    `Last 12 months: ${formatTokens(summary.promptTokens)} prompt + ${formatTokens(summary.completionTokens)} completion`,
    `Accepted agent lines (last 12 months): ${summary.acceptedLines.toLocaleString()}`,
  ].join("\n")
}

function renderMonthLabels(start: Date, weekCount: number): string {
  const width = Math.max(1, weekCount * 2 - 1)
  const chars = Array.from({ length: width }, () => " ")
  let previousMonth = -1
  for (let week = 0; week < weekCount; week += 1) {
    const date = addDays(start, week * 7)
    const month = date.getMonth()
    if (month === previousMonth) continue
    previousMonth = month
    const label = date.toLocaleString("en-US", { month: "short" }).slice(0, 1)
    chars[Math.min(width - 1, week * 2)] = label
  }
  return chars.join("").trimEnd()
}

function calculateStreaks(values: Map<string, number>, end: Date): { current: number; longest: number } {
  let current = 0
  for (let cursor = end; (values.get(localDayKey(cursor)) ?? 0) > 0; cursor = addDays(cursor, -1)) current += 1
  const activeDays = [...values.entries()].filter(([, count]) => count > 0).map(([day]) => day).sort()
  let longest = 0
  let run = 0
  let previous: Date | undefined
  for (const day of activeDays) {
    const date = new Date(`${day}T12:00:00`)
    run = previous && Math.round((date.getTime() - previous.getTime()) / dayMs) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = date
  }
  return { current, longest }
}

function cell(value: number, max: number): string {
  if (value < 0) return " "
  if (value === 0 || max === 0) return intensity[0]
  return intensity[Math.min(4, Math.max(1, Math.ceil((value / max) * 4)))]
}

function lineCount(value: string): number {
  if (!value) return 0
  const lines = value.split(/\r?\n/)
  return lines.at(-1) === "" ? lines.length - 1 : lines.length
}

function startOfLocalDay(timestamp: number): Date {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatCost(value: number): string {
  if (value <= 0) return "$0.0000"
  if (value < 0.0001) return "<$0.0001"
  if (value < 1) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`
  return String(value)
}
