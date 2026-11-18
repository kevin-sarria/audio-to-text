export class TimeRange {
  constructor(
    public readonly startMs: number,
    public readonly endMs: number
  ) {
    if (startMs < 0) {
      throw new Error("El tiempo de inicio no puede ser negativo");
    }
    if (endMs <= startMs) {
      throw new Error("El tiempo final debe ser estrictamente mayor al tiempo inicial");
    }
  }

  public get durationMs(): number {
    return this.endMs - this.startMs;
  }

  public overlaps(other: TimeRange): boolean {
    return this.startMs < other.endMs && this.endMs > other.startMs;
  }
}
