import { chmod } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import "./ensure-node-version.mjs"
import { runDevelopmentCommand } from "./run-development-command.mjs"

export async function buildProject() {
  await import("./clean-dist.mjs")

  const typeScriptStatus = runDevelopmentCommand("compile")
  if (typeScriptStatus !== 0) throw new Error(`TypeScript build failed with exit code ${typeScriptStatus}.`)

  await import("./copy-prompts.mjs")
  await build({
    banner: {
      js: 'import { createRequire } from "node:module";const require = createRequire(import.meta.url);',
    },
    bundle: true,
    entryPoints: ["src/cli.ts"],
    external: ["better-sqlite3", "@earendil-works/pi-tui"],
    format: "esm",
    outfile: "dist/cli.js",
    platform: "node",
    target: "node22",
  })

  if (shouldSetExecutableBit()) await chmod("dist/cli.js", 0o755)
}

export function shouldSetExecutableBit(platform = process.platform) {
  return platform !== "win32"
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await buildProject()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
