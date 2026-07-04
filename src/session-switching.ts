export function normalizePinnedChatIds(ids: string[] | undefined): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const id of ids || []) {
    const clean = id.trim()
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    normalized.push(clean)
    if (normalized.length >= 5) break
  }
  return normalized
}

export function parsePinnedChatSwitch(prompt: string): number | undefined {
  const match = prompt.trim().match(/^#([1-5])$/)
  return match ? Number.parseInt(match[1] || "", 10) : undefined
}

export function isHistoryAutocompleteValue(value: string): boolean {
  return /^\/resume\s+\d+$/.test(value.trim())
}
