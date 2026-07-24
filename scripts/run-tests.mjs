import { buildProject } from "./build.mjs"
import { runDevelopmentCommand } from "./run-development-command.mjs"

try {
  await buildProject()
  process.exitCode = runDevelopmentCommand("test", process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
