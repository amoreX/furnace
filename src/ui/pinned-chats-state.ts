export class PinnedChatsPanelState {
  chatCount = 0
  focused = false
  restoreHidden = false
  selectedIndex = 0
  visible = true

  setChatCount(count: number): void {
    this.chatCount = Math.max(0, Math.floor(count))
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.chatCount - 1))
    if (this.chatCount === 0 && this.focused) this.finishInteraction()
  }

  focus(): boolean {
    if (this.chatCount === 0) return false
    this.restoreHidden = !this.visible
    this.visible = true
    this.focused = true
    return true
  }

  toggle(): boolean {
    if (this.chatCount === 0) return false
    this.visible = !this.visible
    this.restoreHidden = false
    if (!this.visible) this.focused = false
    return true
  }

  finishInteraction(): void {
    this.focused = false
    if (this.restoreHidden) this.visible = false
    this.restoreHidden = false
  }

  select(index: number): void {
    this.selectedIndex = Math.min(Math.max(0, Math.floor(index)), Math.max(0, this.chatCount - 1))
  }
}
