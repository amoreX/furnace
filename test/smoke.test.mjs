import { readFile } from "node:fs/promises"
import { test } from "node:test"
import assert from "node:assert/strict"

test("project exposes the expected phase 0 commands", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

  assert.equal(packageJson.bin.furnace, "./dist/cli.js")
  assert.match(packageJson.scripts.build, /\btsc -p tsconfig\.json\b/)
  assert.match(packageJson.scripts.build, /\besbuild src\/cli\.ts\b/)
  assert.match(packageJson.scripts.build, /--outfile=dist\/cli\.js/)
  assert.match(packageJson.scripts.typecheck, /tsc -p tsconfig\.json --noEmit/)
})

test("local secrets are ignored", async () => {
  const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8")

  assert.match(gitignore, /^\.env$/m)
  assert.match(gitignore, /^\.env\.\*$/m)
  assert.match(gitignore, /^!\.env\.example$/m)
  assert.match(gitignore, /^\.furnace\/$/m)
})

test("/change is exposed as a built-in command", async () => {
  const { isKnownSlashCommand, slashCommandDefinitions } = await import("../dist/commands/builtins.js")
  assert.equal(isKnownSlashCommand("/change"), true)
  assert.match(slashCommandDefinitions.find((command) => command.name === "/change")?.description || "", /what.s new/i)
})

test("/tip is exposed as a built-in command", async () => {
  const { isKnownSlashCommand, slashCommandDefinitions } = await import("../dist/commands/builtins.js")
  assert.equal(isKnownSlashCommand("/tip"), true)
  assert.match(slashCommandDefinitions.find((command) => command.name === "/tip")?.description || "", /idle.*tips/i)
})

test("/snow is exposed with intensity guidance", async () => {
  const { isKnownSlashCommand, parseSlashCommand, slashCommandDefinitions } = await import("../dist/commands/builtins.js")
  assert.equal(isKnownSlashCommand("/snow"), true)
  assert.match(slashCommandDefinitions.find((command) => command.name === "/snow")?.usage || "", /low\|medium\|hard/)
  assert.deepEqual(parseSlashCommand("/snow hard"), { name: "/snow", argument: "hard" })
})

test("startup mounts What’s New after terminal initialization", async () => {
  const controller = await readFile(new URL("../src/interactive-session-controller.ts", import.meta.url), "utf8")
  const startup = controller.slice(
    controller.indexOf("applyBaseAutocompleteItems("),
    controller.indexOf("// Non-blocking startup update check"),
  )

  const refresh = startup.indexOf("refreshCurrentSession()")
  const run = startup.indexOf("terminal.run()")
  const modelSync = startup.indexOf("syncModelDisplayFromCache()")
  const modelSyncSettled = startup.indexOf("Promise.allSettled([initialModelSync])")
  const whatsNew = startup.indexOf("maybeShowWhatsNew()")
  assert.ok(refresh < run && run < modelSync && modelSync < modelSyncSettled && modelSyncSettled < whatsNew)
})

test("termcn theme registry exposes all bundled themes", async () => {
  const { resolveTheme, themeChoices } = await import("../dist/ui/themes/index.js")
  const names = themeChoices.map((theme) => theme.name)

  // Keep the registry ordering stable while Gruvbox is the product default.
  assert.equal(names[0], "pi-dark")
  assert.equal(resolveTheme(undefined).name, "gruvbox")

  // Core hand-crafted themes must be present
  const core = ["pi-dark", "synthwave-84", "space", "flexoki", "default", "dracula", "catppuccin", "tokyo-night", "nord", "rosepine", "gruvbox"]
  for (const name of core) {
    assert.equal(resolveTheme(name).name, name)
  }
  // Total should include all bundled hand-crafted themes
  assert.ok(themeChoices.length >= 30, `expected 30+ themes, got ${themeChoices.length}`)
  assert.equal(resolveTheme("tokyo night").name, "tokyo-night")
})
