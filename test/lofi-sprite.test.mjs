import assert from "node:assert/strict"
import test from "node:test"

const { LofiSpriteSurface } = await import("../dist/ui/pi/lofi-sprite-surface.js")

test("lofi chibi stays hidden until lofi is enabled", () => {
  const surface = new LofiSpriteSurface()

  assert.deepEqual(surface.render(10), [])
  surface.setEnabled(true)
  assert.match(surface.render(30)[0], /♪ \(˶ᵔ ᵕ ᵔ˶\)╯╲$/)
})

test("lofi chibi alternates its dance pose", () => {
  const surface = new LofiSpriteSurface()
  surface.setEnabled(true)
  const first = surface.render(30)
  surface.setFrame(1)
  const second = surface.render(30)

  assert.notDeepEqual(second, first)
  assert.match(second[0], /♫ \(˶ᵔ ᵕ ᵔ˶\)╮╱$/)
})
