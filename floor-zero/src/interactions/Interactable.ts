import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { RecordedEventKind } from '../core/types';

export type InteractKind =
  | 'door'
  | 'switch'
  | 'lever'
  | 'button'
  | 'item'
  | 'note'
  | 'tape'
  | 'screen'
  | 'clock'
  | 'toy'
  | 'hide'
  | 'panel'
  | 'ending';

/**
 * Everything the player can point at implements this. The mimic replays
 * interactions by looking up the same ids, which is what makes the replay
 * puzzle genuinely data driven instead of an animation.
 */
export interface Interactable {
  readonly id: string;
  readonly kind: InteractKind;
  /** Object used for the look-at ray test. */
  readonly hitbox: THREE.Object3D;
  enabled: boolean;
  maxDistance: number;
  /** Prompt label, or null to show no prompt at all. */
  prompt(ctx: GameContext): string | null;
  activate(ctx: GameContext): void;
  update?(delta: number, ctx: GameContext): void;
  /** Event kind written into the recording when the player uses this. */
  readonly recordAs?: RecordedEventKind;
  /** Called when the mimic replays a recorded use of this id. */
  replay?(ctx: GameContext): void;
}

export abstract class BaseInteractable implements Interactable {
  enabled = true;
  maxDistance = 2.6;
  recordAs?: RecordedEventKind;

  protected constructor(
    readonly id: string,
    readonly kind: InteractKind,
    readonly hitbox: THREE.Object3D,
  ) {
    hitbox.userData.interactableId = id;
  }

  abstract prompt(ctx: GameContext): string | null;
  abstract activate(ctx: GameContext): void;
}

/** Simple callback-driven interactable, used for most one-off props. */
export class SimpleInteractable extends BaseInteractable {
  constructor(
    id: string,
    kind: InteractKind,
    hitbox: THREE.Object3D,
    private readonly labelFn: (ctx: GameContext) => string | null,
    private readonly action: (ctx: GameContext) => void,
    options: { maxDistance?: number; recordAs?: RecordedEventKind } = {},
  ) {
    super(id, kind, hitbox);
    if (options.maxDistance !== undefined) this.maxDistance = options.maxDistance;
    if (options.recordAs) this.recordAs = options.recordAs;
  }

  prompt(ctx: GameContext): string | null {
    return this.enabled ? this.labelFn(ctx) : null;
  }

  activate(ctx: GameContext): void {
    if (!this.enabled) return;
    this.action(ctx);
  }

  replay(ctx: GameContext): void {
    if (!this.enabled) return;
    this.action(ctx);
  }
}
