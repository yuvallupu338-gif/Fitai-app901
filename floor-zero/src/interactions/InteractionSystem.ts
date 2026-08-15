import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Interactable } from './Interactable';

/**
 * One ray, one prompt, one key. Every door, switch, note, clock and toy in the
 * game goes through here, which is also what lets the mimic "press" things by
 * id when it replays a recording.
 */
export class InteractionSystem {
  private items: Interactable[] = [];
  private byId = new Map<string, Interactable>();
  private hitboxes: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private focused: Interactable | null = null;
  private lastPrompt: string | null = null;
  /** Set while the player is reading a note or watching a tape. */
  blocked = false;

  get all(): readonly Interactable[] {
    return this.items;
  }

  get current(): Interactable | null {
    return this.focused;
  }

  register(item: Interactable): Interactable {
    this.items.push(item);
    this.byId.set(item.id, item);
    this.hitboxes.push(item.hitbox);
    return item;
  }

  registerAll(items: readonly Interactable[]): void {
    for (const item of items) this.register(item);
  }

  get(id: string): Interactable | undefined {
    return this.byId.get(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const item = this.byId.get(id);
    if (item) item.enabled = enabled;
  }

  clear(): void {
    this.items = [];
    this.byId.clear();
    this.hitboxes = [];
    this.focused = null;
    this.lastPrompt = null;
  }

  /**
   * Runs a recorded interaction. Returns false when the id no longer exists,
   * which happens when the floor plan changed between visits.
   */
  replay(id: string): boolean {
    const item = this.byId.get(id);
    if (!item || !item.enabled) return false;
    if (item.replay) item.replay(this.context!);
    else item.activate(this.context!);
    return true;
  }

  private context: GameContext | null = null;

  update(delta: number, ctx: GameContext): void {
    this.context = ctx;

    for (const item of this.items) item.update?.(delta, ctx);

    if (!ctx.state.isInteractive || this.blocked) {
      this.setFocus(null, ctx);
      return;
    }

    this.raycaster.set(ctx.camera.position, ctx.player.forward.clone().normalize());
    this.raycaster.near = 0;
    this.raycaster.far = 3.4;
    // Aim exactly down the camera axis rather than the flattened forward, so
    // looking down at a low object still works.
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
    this.raycaster.set(ctx.camera.position, direction);

    const hits = this.raycaster.intersectObjects(this.hitboxes, true);
    let found: Interactable | null = null;
    for (const hit of hits) {
      const item = this.findOwner(hit.object);
      if (!item || !item.enabled) continue;
      if (hit.distance > item.maxDistance) continue;
      found = item;
      break;
    }

    this.setFocus(found, ctx);

    if (found && ctx.input.wasPressed('interact')) {
      this.activate(found, ctx);
    }
  }

  private findOwner(object: THREE.Object3D): Interactable | null {
    let node: THREE.Object3D | null = object;
    while (node) {
      const id = node.userData?.interactableId as string | undefined;
      if (id) {
        const item = this.byId.get(id);
        if (item) return item;
      }
      node = node.parent;
    }
    return null;
  }

  private setFocus(item: Interactable | null, ctx: GameContext): void {
    this.focused = item;
    const prompt = item ? item.prompt(ctx) : null;
    if (prompt !== this.lastPrompt) {
      this.lastPrompt = prompt;
      ctx.ui.setPrompt(prompt);
    }
  }

  activate(item: Interactable, ctx: GameContext): void {
    item.activate(ctx);
    ctx.bus.emit('interaction_triggered', { id: item.id, kind: item.kind });
    if (item.recordAs) ctx.recorder.recordEvent(item.recordAs, item.id);
  }

  /** Used by the touch "E" button and by scripted moments. */
  activateFocused(ctx: GameContext): void {
    if (this.focused) this.activate(this.focused, ctx);
  }
}
