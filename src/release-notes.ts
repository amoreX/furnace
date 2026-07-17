import manifest from "./releases.json" with { type: "json" }

export type ReleaseChangeKind = "added" | "changed" | "compatibility" | "fixed" | "removed"
export type ReleaseStatus = "published" | "tagged" | "upcoming"

export type FurnaceRelease = {
  version: string
  date: string
  status: ReleaseStatus
  commit: string | null
  summary: string
  changes: Array<{
    kind: ReleaseChangeKind
    text: string
  }>
}

const releases = manifest.releases as FurnaceRelease[]

export function furnaceReleases(): readonly FurnaceRelease[] {
  return releases
}

export function furnaceRelease(version: string): FurnaceRelease | undefined {
  return releases.find((release) => release.version === version)
}

export function unacknowledgedFurnaceRelease(
  version: string,
  acknowledgedVersions: readonly string[],
): FurnaceRelease | undefined {
  const latestRelease = releases[0]
  if (!latestRelease || latestRelease.version !== version) return undefined
  if (acknowledgedVersions.includes(version)) return undefined
  return latestRelease
}

export function validateReleaseManifest(): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  let previous: number[] | undefined

  for (const [index, release] of releases.entries()) {
    const parsed = parseVersion(release.version)
    if (!parsed) errors.push(`Release ${index + 1} has an invalid version: ${release.version}`)
    if (seen.has(release.version)) errors.push(`Duplicate release version: ${release.version}`)
    seen.add(release.version)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(release.date)) errors.push(`Release ${release.version} has an invalid date.`)
    if (!release.summary.trim()) errors.push(`Release ${release.version} has no summary.`)
    if (release.changes.length === 0) errors.push(`Release ${release.version} has no changes.`)
    if (previous && parsed && compareVersions(previous, parsed) <= 0) {
      errors.push(`Release ${release.version} is not in descending version order.`)
    }
    if (parsed) previous = parsed
  }

  return errors
}

function parseVersion(version: string): number[] | undefined {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  return match ? match.slice(1).map(Number) : undefined
}

function compareVersions(a: number[], b: number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}
