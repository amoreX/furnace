import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PACKAGE_SPEC = "cook-furnace@latest"

type UpdateProcessResult = {
  error?: Error
  signal?: NodeJS.Signals | null
  status: number | null
}

export type SelfUpdateOptions = {
  packageRoot?: string
  platform?: NodeJS.Platform
  spawn?: (command: string, args: string[], options: { stdio: "inherit" }) => UpdateProcessResult
  stderr?: (message: string) => void
  stdout?: (message: string) => void
}

export function furnacePackageRoot(moduleUrl = import.meta.url): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "..")
}

export function isSourceCheckout(packageRoot: string): boolean {
  return existsSync(resolve(packageRoot, ".git"))
}

export function runSelfUpdate(options: SelfUpdateOptions = {}): boolean {
  const packageRoot = options.packageRoot ?? furnacePackageRoot()
  const stderr = options.stderr ?? ((message: string) => process.stderr.write(message))
  const stdout = options.stdout ?? ((message: string) => process.stdout.write(message))

  if (isSourceCheckout(packageRoot)) {
    stderr(
      "Furnace is running from a source checkout, so self-update was not run.\n" +
      "Update this checkout with Git, then run `npm install` and `npm run build`.\n",
    )
    return false
  }

  const platform = options.platform ?? process.platform
  const command = platform === "win32" ? "npm.cmd" : "npm"
  const spawn = options.spawn ?? spawnSync

  stdout(`Updating Furnace to the latest published version...\n`)
  const result = spawn(command, ["install", "--global", PACKAGE_SPEC], { stdio: "inherit" })

  if (result.error) {
    stderr(`Unable to run npm: ${result.error.message}\n`)
    return false
  }
  if (result.status !== 0) {
    const detail = result.signal ? ` (terminated by ${result.signal})` : ""
    stderr(`Furnace update failed${detail}.\n`)
    return false
  }

  stdout("Furnace updated to the latest published version. Restart it to use the update.\n")
  return true
}
