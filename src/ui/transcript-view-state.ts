export class TranscriptViewState {
  private clearedThrough?: { entryId?: string; sessionId: string }

  clear<T extends { id: string }>(sessionId: string, entries: T[]): void {
    this.clearedThrough = {
      entryId: entries.at(-1)?.id,
      sessionId,
    }
  }

  reset(): void {
    this.clearedThrough = undefined
  }

  visibleEntries<T extends { id: string }>(sessionId: string, entries: T[]): T[] {
    const boundary = this.clearedThrough
    if (!boundary || boundary.sessionId !== sessionId || !boundary.entryId) return entries
    const boundaryIndex = entries.findIndex((entry) => entry.id === boundary.entryId)
    return boundaryIndex >= 0 ? entries.slice(boundaryIndex + 1) : entries
  }
}
