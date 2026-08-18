export type Yielded = number | (() => boolean) | void;
export type Routine = Generator<Yielded, void, void>;

interface RunningRoutine {
  id: string;
  gen: Routine;
  wait: number;
  until: (() => boolean) | null;
  done: boolean;
}

/**
 * Tiny coroutine runner. Scripted sequences (the lift ride, the endings, the
 * scares) are written as generators that `yield` a number of seconds or a
 * predicate to wait on. Everything advances from the single game loop, so a
 * paused game genuinely pauses the story.
 */
export class Sequencer {
  private routines: RunningRoutine[] = [];
  private counter = 0;

  run(gen: Routine, id?: string): string {
    this.counter += 1;
    const routineId = id ?? `routine_${this.counter}`;
    this.stop(routineId);
    this.routines.push({ id: routineId, gen, wait: 0, until: null, done: false });
    return routineId;
  }

  stop(id: string): void {
    const routine = this.routines.find((r) => r.id === id);
    if (routine) routine.done = true;
  }

  stopAll(): void {
    for (const routine of this.routines) routine.done = true;
    this.routines = [];
  }

  isRunning(id: string): boolean {
    return this.routines.some((r) => r.id === id && !r.done);
  }

  get busy(): boolean {
    return this.routines.some((r) => !r.done);
  }

  update(delta: number): void {
    if (this.routines.length === 0) return;
    for (const routine of this.routines) {
      if (routine.done) continue;
      if (routine.until) {
        if (!routine.until()) continue;
        routine.until = null;
      }
      if (routine.wait > 0) {
        routine.wait -= delta;
        if (routine.wait > 0) continue;
      }
      this.step(routine);
    }
    this.routines = this.routines.filter((r) => !r.done);
  }

  private step(routine: RunningRoutine): void {
    // Drain instant yields so a generator can emit several steps in one frame.
    for (let guard = 0; guard < 256; guard++) {
      let result: IteratorResult<Yielded, void>;
      try {
        result = routine.gen.next();
      } catch (error) {
        console.error('[Sequencer] routine failed', error);
        routine.done = true;
        return;
      }
      if (result.done) {
        routine.done = true;
        return;
      }
      const value = result.value;
      if (typeof value === 'number') {
        routine.wait = value;
        if (value > 0) return;
      } else if (typeof value === 'function') {
        routine.until = value;
        if (!value()) return;
        routine.until = null;
      }
      // undefined → yield one frame
      if (value === undefined) return;
    }
  }
}
