import { sliceByColumn, visibleWidth, type Component } from "@earendil-works/pi-tui"

export const LOFI_CHIBI_FPS = 2

const LOFI_CHIBI_FRAMES = [
  "♪ (˶ᵔ ᵕ ᵔ˶)╯╲",
  "♫ (˶ᵔ ᵕ ᵔ˶)╮╱",
] as const

export class LofiSpriteSurface implements Component {
  private enabled = false
  private frame = 0

  setFrame(frame: number): void {
    this.frame = frame
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  invalidate(): void {}

  render(width: number): string[] {
    if (!this.enabled || width <= 0) return []
    const frame = LOFI_CHIBI_FRAMES[this.frame % LOFI_CHIBI_FRAMES.length]
    return frame ? [alignRight(frame, width)] : []
  }
}

function alignRight(line: string, width: number): string {
  const lineWidth = visibleWidth(line)
  const visibleLine = lineWidth > width ? sliceByColumn(line, lineWidth - width, lineWidth) : line
  return `${" ".repeat(Math.max(0, width - visibleWidth(visibleLine)))}${visibleLine}`
}
