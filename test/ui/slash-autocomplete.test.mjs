import { describe, it } from "node:test"
import assert from "node:assert"
import { SlashCommandAutocompleteProvider } from "../../dist/ui/pi-components/slash-autocomplete.js"

describe("SlashCommandAutocompleteProvider", () => {
  it("returns null when line does not start with /", async () => {
    const provider = new SlashCommandAutocompleteProvider([
      { value: "/login", label: "Login", description: "Set API key" },
    ])
    const result = await provider.getSuggestions(["hello"], 0, 5)
    assert.strictEqual(result, null)
  })

  it("returns matching slash commands for prefix", async () => {
    const provider = new SlashCommandAutocompleteProvider([
      { value: "/login", label: "Login", description: "Set API key" },
      { value: "/model", label: "Model", description: "Pick a model" },
      { value: "/theme", label: "Theme", description: "Change theme" },
    ])
    const result = await provider.getSuggestions(["/lo"], 0, 3)
    assert.ok(result)
    assert.strictEqual(result.items.length, 1)
    assert.strictEqual(result.items[0].value, "/login")
    assert.strictEqual(result.items[0].label, "Login")
  })

  it("applies completion by replacing prefix", () => {
    const provider = new SlashCommandAutocompleteProvider([
      { value: "/login", label: "Login" },
    ])
    const applied = provider.applyCompletion(["/lo"], 0, 3, { value: "/login", label: "Login" }, "/lo")
    assert.strictEqual(applied.lines[0], "/login")
    assert.strictEqual(applied.cursorLine, 0)
    assert.strictEqual(applied.cursorCol, 6)
  })

  it("calls onTab and skips default apply when handler returns true", () => {
    let called = false
    const provider = new SlashCommandAutocompleteProvider(
      [{ value: "/history", label: "History" }],
      (match) => {
        called = true
        assert.strictEqual(match.value, "/history")
        assert.strictEqual(match.selected, true)
        return true
      },
    )
    const applied = provider.applyCompletion(["/hi"], 0, 3, { value: "/history", label: "History" }, "/hi")
    assert.strictEqual(called, true)
    assert.strictEqual(applied.lines[0], "/hi")
    assert.strictEqual(applied.cursorCol, 3)
  })
})
