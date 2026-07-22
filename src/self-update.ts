import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { installManagedFurnace, type ManagedInstallOptions, type ManagedInstallResult } from "./managed-install.js"

const PACKAGE_SPEC = "cook-furnace@latest"

export type SelfUpdateOptions = {
  env?: NodeJS.ProcessEnv
  install?: (options: ManagedInstallOptions) => ManagedInstallResult
  packageRoot?: string
  platform?: NodeJS.Platform
  spawn?: ManagedInstallOptions["spawn"]
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
  const env = options.env ?? process.env
  const install = options.install ?? installManagedFurnace

  stdout(`Updating Furnace to the latest published version...\n`)
  let result: ManagedInstallResult
  try {
    result = install({
      env,
      packageSpec: PACKAGE_SPEC,
      platform,
      root: env.FURNACE_MANAGED_ROOT,
      spawn: options.spawn,
      stdout,
    })
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ""
    stderr(`Furnace update failed${detail}.\n`)
    return false
  }

  stdout(
    `Furnace ${result.version} is installed. Restart it to use the update.\n` +
    (result.pathChanged ? "Reopen your terminal so the `furnace` command is available on PATH.\n" : "") +
    "Any Evolve changes will be reapplied on the next launch; follow the prompts if you have Evolve changes.\n" +
    "View the latest changelog with `/change` or at https://furnace.unordinary.software/changelog.\n",
  )
  return true
}
