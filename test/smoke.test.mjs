import { readFile } from "node:fs/promises"
import { test } from "node:test"
import assert from "node:assert/strict"

test("project exposes the expected phase 0 commands", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

  assert.equal(packageJson.bin.furnace, "./dist/cli.js")
  assert.match(packageJson.scripts.build, /\btsc -p tsconfig\.json\b/)
  assert.match(packageJson.scripts.build, /\besbuild src\/cli\.ts\b/)
  assert.match(packageJson.scripts.build, /--outfile=dist\/cli\.js/)
  assert.equal(packageJson.scripts.typecheck, "tsc -p tsconfig.json --noEmit")
})

test("local secrets are ignored", async () => {
  const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8")

  assert.match(gitignore, /^\.env$/m)
  assert.match(gitignore, /^\.env\.\*$/m)
  assert.match(gitignore, /^!\.env\.example$/m)
  assert.match(gitignore, /^\.furnace\/$/m)
})

test("termcn theme registry exposes all bundled themes", async () => {
  const { resolveTheme, themeChoices } = await import("../dist/ui/terminal-themes/index.js")
  const names = themeChoices.map((theme) => theme.name)

  assert.deepEqual(names, ["flexoki", "default", "dracula", "catppuccin", "tokyo-night", "nord", "rosepine", "gruvbox"])
  for (const name of names) {
    assert.equal(resolveTheme(name).name, name)
  }
  assert.equal(resolveTheme("tokyo night").name, "tokyo-night")
})

test("assistant markdown inline formatting is parsed for terminal rendering", async () => {
  const { parseInlineMarkdown } = await import("../dist/ui/ink-terminal.js")

  assert.deepEqual(parseInlineMarkdown("**File operations:** `read` and *search*"), [
    { kind: "bold", text: "File operations:" },
    { kind: "text", text: " " },
    { kind: "code", text: "read" },
    { kind: "text", text: " and " },
    { kind: "italic", text: "search" },
  ])
})

test("edit tool activity renders as a diff preview", async () => {
  const { formatToolActivity } = await import("../dist/ui/ink-terminal.js")
  const lines = formatToolActivity(
    {
      id: "call-1",
      name: "edit",
      status: "done",
      args: JSON.stringify({
        patch: `*** Begin Patch
*** Update File: docs/design-choices.md
@@
-old line
+new line
 context line
*** End Patch`,
      }),
      result: "Updated docs/design-choices.md (1 hunks)",
    },
    80,
  )

  assert.deepEqual(lines.map((line) => line.tone), ["summary", "meta", "meta", "deletion", "addition", "context"])
  assert.match(lines[0].text, /ok Edited docs\/design-choices\.md/)
  assert.equal(lines[3].text.trim(), "-old line")
  assert.equal(lines[4].text.trim(), "+new line")
})

test("chat viewport reserves space above fixed input chrome", async () => {
  const { chatViewportRows } = await import("../dist/ui/ink-terminal.js")

  assert.equal(chatViewportRows(24), 13)
  assert.equal(chatViewportRows(24, 8), 5)
  assert.equal(chatViewportRows(8), 3)
})

test("approval prompt exposes scoped permission choices", async () => {
  const { approvalChoiceItems } = await import("../dist/ui/ink-terminal.js")
  const choices = approvalChoiceItems("bash")

  assert.deepEqual(
    choices.map((choice) => choice.value),
    ["allow_once", "allow_tool_session", "allow_all_session", "deny"],
  )
  assert.equal(choices[1].label, "Allow bash for conversation")
  assert.equal(choices[2].label, "Allow all tools for conversation")
})
