import { Container, visibleWidth } from "@earendil-works/pi-tui"
import type { SnowIntensity } from "../terminal-types.js"

type SnowPoint = { glyph: string; x: number; y: number }

const INTENSITY_DIVISOR: Record<Exclude<SnowIntensity, "off">, number> = {
  low: 100,
  medium: 38,
  hard: 18,
}

function seededRand(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}

export function snowPoints(width: number, height: number, frame: number, intensity: SnowIntensity): SnowPoint[] {
  if (intensity === "off" || width <= 0 || height <= 0) return []
  const count = Math.max(3, Math.floor((width * height) / INTENSITY_DIVISOR[intensity]))
  const rand = seededRand(width * 1009 + height * 9176 + intensity.length * 313)
  const points: SnowPoint[] = []
  for (let index = 0; index < count; index += 1) {
    const layer = index % 3
    const baseX = Math.floor(rand() * width)
    const baseY = Math.floor(rand() * height)
    const verticalStep = layer === 0 ? Math.floor(frame / 3) : layer === 1 ? Math.floor(frame / 2) : frame
    const horizontalStep = layer === 0 ? Math.floor(frame / 18) : layer === 1 ? -Math.floor(frame / 14) : Math.floor(frame / 9)
    points.push({
      glyph: layer === 0 ? "·" : layer === 1 ? "*" : "❄",
      x: positiveModulo(baseX + horizontalStep + index * 5, width),
      y: positiveModulo(baseY + verticalStep + index * 2, height),
    })
  }
  return points
}

function consumeEscapeSequence(value: string, start: number): number {
  if (value[start] !== "\x1b") return start + 1
  if (value[start + 1] === "[") {
    let index = start + 2
    while (index < value.length && !/[@-~]/.test(value[index]!)) index += 1
    return Math.min(value.length, index + 1)
  }
  if (value[start + 1] === "]") {
    const bell = value.indexOf("\x07", start + 2)
    return bell === -1 ? value.length : bell + 1
  }
  return Math.min(value.length, start + 2)
}

function overlayLine(line: string, width: number, points: Map<number, string>): string {
  const padded = line + " ".repeat(Math.max(0, width - visibleWidth(line)))
  let output = ""
  let column = 0
  let index = 0
  while (index < padded.length) {
    if (padded[index] === "\x1b") {
      const end = consumeEscapeSequence(padded, index)
      output += padded.slice(index, end)
      index = end
      continue
    }
    const codePoint = padded.codePointAt(index)
    if (codePoint === undefined) break
    const char = String.fromCodePoint(codePoint)
    const snow = points.get(column)
    output += char === " " && snow ? snow : char
    column += Math.max(1, visibleWidth(char))
    index += char.length
  }
  return output
}

export function overlaySnow(
  lines: string[],
  width: number,
  frame: number,
  intensity: SnowIntensity,
  // Limit flakes to the visible terminal viewport so offscreen history does not
  // change every frame (that triggers pi-tui full redraws that wipe scrollback).
  visibleRows?: number,
): string[] {
  if (intensity === "off" || lines.length === 0) return lines
  const start = visibleRows && visibleRows > 0
    ? Math.max(0, lines.length - visibleRows)
    : 0
  const height = lines.length - start
  const byRow = new Map<number, Map<number, string>>()
  for (const point of snowPoints(width, height, frame, intensity)) {
    const row = start + point.y
    const cells = byRow.get(row) ?? new Map<number, string>()
    cells.set(point.x, point.glyph)
    byRow.set(row, cells)
  }
  return lines.map((line, row) => (
    row < start ? line : overlayLine(line, width, byRow.get(row) ?? new Map())
  ))
}

export class SnowfallSurface extends Container {
  private frame = 0
  private intensity: SnowIntensity = "off"
  private visibleRows = 0

  setFrame(frame: number): void {
    this.frame = frame
  }

  setIntensity(intensity: SnowIntensity): void {
    this.intensity = intensity
  }

  setVisibleRows(rows: number): void {
    this.visibleRows = Math.max(0, rows)
  }

  getIntensity(): SnowIntensity {
    return this.intensity
  }

  override render(width: number): string[] {
    return overlaySnow(
      super.render(width),
      width,
      this.frame,
      this.intensity,
      this.visibleRows > 0 ? this.visibleRows : undefined,
    )
  }
}
