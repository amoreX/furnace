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
