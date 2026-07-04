import { readFileSync } from "node:fs"

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { name?: string; version?: string }

export const packageName = packageJson.name || "furnace"
export const packageVersion = packageJson.version || "0.0.0"
