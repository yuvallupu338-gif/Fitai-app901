/**
 * Small typed publish/subscribe bus. Every system talks through this instead of
 * holding references to each other, so the director, audio, UI and world stay
 * decoupled.
 */

export interface GameEventMap {
  chapter_started: { chapter: number; visit: number };
  chapter_completed: { chapter: number };
  objective_changed: { text: string };

  interaction_triggered: { id: string; kind: string };
  door_opened: { id: string };
  door_closed: { id: string };
  item_collected: { id: string; name: string };
  item_used: { id: string };
  puzzle_solved: { id: string };
  note_read: { id: string };
  tape_played: { id: string };

  anomaly_triggered: { id: string; index: number };
  anomaly_resolved: { id: string };

  recording_started: { visit: number };
  recording_finished: { visit: number; duration: number; samples: number };
  mimic_spawned: { level: number };
  mimic_deviation: { kind: string };
  mimic_interaction: { targetId: string };

  tension_changed: { value: number };
  checkpoint_saved: { chapter: number; label: string };
  ending_selected: { ending: 1 | 2 | 3 };

  subtitle: { text: string; duration?: number; speaker?: string };
  toast: { text: string };
  scare: { id: string; intensity: number };
  flashlight_toggled: { on: boolean };
  elevator_state: { state: 'closing' | 'travelling' | 'opening' | 'idle'; floor: string };
  player_caught: { by: string };
  chase_started: Record<string, never>;
  chase_ended: { survived: boolean };
  power_changed: { on: boolean };
  game_paused: { paused: boolean };
  request_hint: Record<string, never>;
}

type Handler<K extends keyof GameEventMap> = (payload: GameEventMap[K]) => void;

export class EventBus {
  private handlers = new Map<string, Set<(payload: never) => void>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event as string);
    if (!set) {
      set = new Set();
      this.handlers.set(event as string, set);
    }
    set.add(handler as (payload: never) => void);
    return () => this.off(event, handler);
  }

  once<K extends keyof GameEventMap>(event: K, handler: Handler<K>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof GameEventMap>(event: K, handler: Handler<K>): void {
    this.handlers.get(event as string)?.delete(handler as (payload: never) => void);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(event as string);
    if (!set) return;
    // Copy so a handler that unsubscribes mid-dispatch cannot corrupt iteration.
    for (const handler of Array.from(set)) {
      try {
        (handler as Handler<K>)(payload);
      } catch (error) {
        console.error(`[EventBus] handler for "${String(event)}" failed`, error);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new EventBus();
