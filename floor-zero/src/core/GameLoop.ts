export type LoopCallback = (delta: number, elapsed: number) => void;

/**
 * requestAnimationFrame driver with a clamped delta so that a stalled tab or a
 * long level rebuild never teleports the player through a wall.
 */
export class GameLoop {
  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private accumulatedFrames = 0;
  private fpsTimer = 0;
  private currentFps = 0;

  constructor(private readonly update: LoopCallback, private readonly maxDelta = 0.1) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      const rawDelta = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const delta = Math.min(this.maxDelta, Math.max(0, rawDelta));
      this.elapsed += delta;

      this.accumulatedFrames++;
      this.fpsTimer += rawDelta;
      if (this.fpsTimer >= 0.5) {
        this.currentFps = this.accumulatedFrames / this.fpsTimer;
        this.accumulatedFrames = 0;
        this.fpsTimer = 0;
      }

      this.update(delta, this.elapsed);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /** Called when the tab regains focus so the next delta is not enormous. */
  resync(): void {
    this.lastTime = performance.now();
  }

  get fps(): number {
    return this.currentFps;
  }

  get time(): number {
    return this.elapsed;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
