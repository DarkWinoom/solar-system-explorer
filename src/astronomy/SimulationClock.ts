const MONTH_MS = 30 * 86_400_000;
export const ADVANCE_RATE = MONTH_MS / 1000;

export class SimulationClock {
  private advancing = false;
  private anchorInstant = 0;
  private anchorElapsed = 0;

  constructor(
    private readonly wallTime: () => number = Date.now,
    private readonly elapsedTime: () => number = () => performance.now(),
  ) {}

  get isAdvancing(): boolean {
    return this.advancing;
  }
  now(): number {
    return this.advancing
      ? this.anchorInstant +
          Math.max(0, this.elapsedTime() - this.anchorElapsed) * ADVANCE_RATE
      : this.wallTime();
  }
  setAdvancing(enabled: boolean): void {
    if (enabled === this.advancing) return;
    if (enabled) {
      this.anchorInstant = this.wallTime();
      this.anchorElapsed = this.elapsedTime();
    }
    this.advancing = enabled;
  }
}
