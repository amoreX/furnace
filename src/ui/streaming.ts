const liveStreamingRenderLimit = 30_000

export function liveStreamingPreview(text: string): string {
  if (text.length <= liveStreamingRenderLimit) return text
  return `… streaming preview truncated for performance; full response is saved when complete …\n\n${text.slice(-liveStreamingRenderLimit)}`
}
