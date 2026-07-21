import assert from "node:assert/strict"
import { test } from "node:test"
import { visibleWidth } from "@earendil-works/pi-tui"

const { overlaySnow, snowPoints } = await import("../../dist/ui/pi/snowfall.js")

test("snow intensity increases flake density", () => {
  const low = snowPoints(100, 30, 0, "low")
  const medium = snowPoints(100, 30, 0, "medium")
  const hard = snowPoints(100, 30, 0, "hard")
  assert.ok(low.length < medium.length)
  assert.ok(medium.length < hard.length)
})

test("snow animates across frames without overwriting interface text", () => {
  const lines = [
    "\x1b[31mFURNACE\x1b[0m" + " ".repeat(33),
    "│ prompt text                          │",
    " ".repeat(40),
  ]
  const first = overlaySnow(lines, 40, 0, "hard")
  const next = overlaySnow(lines, 40, 8, "hard")
  assert.notDeepEqual(first, next)
  assert.match(first[0], /FURNACE/)
  assert.match(first[1], /prompt text/)
  assert.ok(first.every((line) => visibleWidth(line) === 40))
})

test("snow off preserves rendered layouts exactly", () => {
  const lines = ["header", "body"]
  assert.equal(overlaySnow(lines, 80, 10, "off"), lines)
  assert.deepEqual(snowPoints(80, 20, 10, "off"), [])
})
