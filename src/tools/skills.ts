import { basename } from "node:path"
import { renderSkillToolOutput } from "../skills/context.js"
import { loadSkillByName } from "../skills/loader.js"
import { writeManagedSkill, type SkillManageTarget } from "../skills/manage.js"
import { displayPath, listFiles, optionalBoolean, optionalEnum, requiredString } from "./common.js"
import type { ToolContext } from "./types.js"

export async function skillTool(args: unknown, context: ToolContext): Promise<string> {
  const name = requiredString(args, "name")
  const skill = await loadSkillByName(context.cwd, name, { extraPaths: context.skillPaths })
  if (!skill) throw new Error(`Unable to load skill ${name}`)
  const files = await sampleSkillFiles(skill.baseDir)
  return renderSkillToolOutput(skill, files)
}

export async function skillManageTool(args: unknown, context: ToolContext): Promise<string> {
  const name = requiredString(args, "name")
  const description = requiredString(args, "description")
  const body = requiredString(args, "body")
  const target = optionalEnum(args, "target", ["project", "user", "cursor-user", "claude-user"]) as SkillManageTarget | undefined
  const disableModelInvocation = optionalBoolean(args, "disableModelInvocation")
  const overwrite = optionalBoolean(args, "overwrite")
  const result = await writeManagedSkill(context.cwd, {
    body,
    description,
    disableModelInvocation,
    name,
    overwrite,
    target,
  })
  return [
    `${result.created ? "Created" : "Updated"} skill ${name}`,
    `path: ${displayPath(context.cwd, result.filePath)}`,
    `target: ${result.target}`,
    "Run /skills reload to refresh autocomplete and model guidance in the TUI.",
  ].join("\n")
}

async function sampleSkillFiles(baseDir: string, maxFiles = 10): Promise<string[]> {
  const files = await listFiles(baseDir, baseDir, 10_000, "", { skipNoisyDirs: true })
  return files
    .filter((file) => basename(file) !== "SKILL.md")
    .sort((left, right) => left.localeCompare(right))
    .slice(0, maxFiles)
    .map((file) => displayPath(baseDir, file))
}
