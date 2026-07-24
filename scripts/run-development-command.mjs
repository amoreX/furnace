import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import "./ensure-node-version.mjs"

const require = createRequire(import.meta.url)

export function developmentCommand(target, forwardedArgs = []) {
  switch (target) {
    case "compile":
      return [process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json", ...forwardedArgs]]
    case "dev":
      return [process.execPath, [require.resolve("tsx/cli"), "src/cli.ts", ...forwardedArgs]]
    case "start":
      return [process.execPath, ["dist/cli.js", ...forwardedArgs]]
    case "test":
      return [process.execPath, ["--test", ...forwardedArgs]]
    case "typecheck":
      return [process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json", "--noEmit", ...forwardedArgs]]
    default:
      throw new Error(`Unknown development command: ${target}`)
  }
}

export function runDevelopmentCommand(target, forwardedArgs = []) {
  const [command, args] = developmentCommand(target, forwardedArgs)
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2]
  if (!target) {
    console.error("Usage: node scripts/run-development-command.mjs <compile|dev|start|test|typecheck> [...args]")
    process.exit(1)
  }
  try {
    process.exitCode = runDevelopmentCommand(target, process.argv.slice(3))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
