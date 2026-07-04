import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { clamp, optionalNumber, requiredString } from "./common.js"
import type { ToolContext } from "./types.js"

const execFileAsync = promisify(execFile)

export async function bashTool(args: unknown, context: ToolContext): Promise<string> {
  const command = requiredString(args, "command")
  const timeoutMs = clamp(optionalNumber(args, "timeoutMs") || 30_000, 1, 120_000)
  try {
    const { stdout, stderr } = await execFileAsync("/bin/bash", ["-lc", command], {
      cwd: context.cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    })
    return formatCommandResult(0, stdout, stderr)
  } catch (error) {
    if (error && typeof error === "object") {
      const maybe = error as { code?: unknown; killed?: boolean; signal?: unknown; stderr?: unknown; stdout?: unknown }
      const code = typeof maybe.code === "number" ? maybe.code : maybe.killed ? "timeout" : "error"
      return formatCommandResult(code, String(maybe.stdout || ""), String(maybe.stderr || maybe.signal || ""))
    }
    throw error
  }
}

function formatCommandResult(exitCode: number | string, stdout: string, stderr: string): string {
  const parts = [`exit_code: ${exitCode}`]
  if (stdout) parts.push(`stdout:\n${stdout}`)
  if (stderr) parts.push(`stderr:\n${stderr}`)
  return parts.join("\n")
}
