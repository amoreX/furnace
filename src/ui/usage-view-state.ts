export class UsageViewState {
  visible = false

  show(): void {
    this.visible = true
  }

  dismiss(): boolean {
    if (!this.visible) return false
    this.visible = false
    return true
  }
}
