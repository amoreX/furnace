import { describe, it } from "node:test"
import assert from "node:assert"
import { SelectList } from "@earendil-works/pi-tui"
import {
  RelatedAutocompleteSelectList,
  stripSelectListCaret,
} from "../../dist/ui/pi/autocomplete.js"
import { getSelectListTheme, initTheme } from "../../dist/ui/pi/theme.js"

initTheme("default")

describe("stripSelectListCaret", () => {
  it("removes the selected arrow prefix", () => {
    assert.strictEqual(stripSelectListCaret("→ /new  Start a fresh conversation"), "/new  Start a fresh conversation")
  })

  it("removes the unselected indent", () => {
    assert.strictEqual(stripSelectListCaret("  /login"), "/login")
  })

  it("removes the arrow even when wrapped in ANSI color", () => {
    const colored = "\x1b[38;2;255;0;128m→ /new\x1b[39m"
    assert.strictEqual(stripSelectListCaret(colored), "\x1b[38;2;255;0;128m/new\x1b[39m")
  })

  it("leaves already-flush lines alone", () => {
    assert.strictEqual(stripSelectListCaret("/new"), "/new")
  })
})

describe("RelatedAutocompleteSelectList", () => {
  it("renders slash suggestions without the → caret", () => {
    const list = new RelatedAutocompleteSelectList(
      "/ne",
      [{ value: "/new", label: "/new", description: "Start a fresh conversation" }],
      5,
    )
    const lines = list.render(80)
    assert.ok(lines.length >= 1)
    assert.ok(!lines[0].includes("→ "), `expected no arrow, got: ${JSON.stringify(lines[0])}`)
    assert.ok(lines[0].includes("/new"), `expected /new in: ${JSON.stringify(lines[0])}`)
  })

  it("stock SelectList still includes the caret (upstream behavior)", () => {
    const list = new SelectList(
      [{ value: "/new", label: "/new", description: "Start a fresh conversation" }],
      5,
      getSelectListTheme(),
    )
    const lines = list.render(80)
    assert.ok(lines[0].includes("→ "), `expected upstream arrow, got: ${JSON.stringify(lines[0])}`)
  })
})
