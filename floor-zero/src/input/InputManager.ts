import { TouchControls } from './TouchControls';

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'crouch'
  | 'interact'
  | 'flashlight'
  | 'objective'
  | 'pause';

const KEY_MAP: Record<string, Action> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ControlLeft: 'crouch',
  KeyC: 'crouch',
  KeyE: 'interact',
  Space: 'interact',
  KeyF: 'flashlight',
  Tab: 'objective',
  Escape: 'pause',
};

/**
 * Keyboard, mouse and touch merged into one action surface so gameplay code
 * never has to care which one is in use.
 */
export class InputManager {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  private released = new Set<Action>();
  private lookX = 0;
  private lookY = 0;
  private locked = false;
  private touch: TouchControls | null = null;
  /** Blocks gameplay input while a menu is open. */
  enabled = true;
  /** True while any menu wants the pointer free. */
  private wantLock = false;
  private listeners: Array<() => void> = [];

  constructor(private readonly element: HTMLElement) {
    const onKeyDown = (event: KeyboardEvent): void => {
      const action = KEY_MAP[event.code];
      if (!action) return;
      if (action === 'objective' || action === 'interact') event.preventDefault();
      if (event.repeat) return;
      if (action === 'pause') {
        // Escape must always reach the game, even when input is disabled.
        this.pressed.add(action);
        this.down.add(action);
        return;
      }
      if (!this.enabled) return;
      this.down.add(action);
      this.pressed.add(action);
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      const action = KEY_MAP[event.code];
      if (!action) return;
      this.down.delete(action);
      this.released.add(action);
    };

    const onMouseMove = (event: MouseEvent): void => {
      if (!this.locked || !this.enabled) return;
      this.lookX += event.movementX;
      this.lookY += event.movementY;
    };

    const onMouseDown = (event: MouseEvent): void => {
      if (!this.enabled || !this.locked) return;
      if (event.button === 0) {
        this.down.add('interact');
        this.pressed.add('interact');
      }
    };

    const onMouseUp = (event: MouseEvent): void => {
      if (event.button === 0) this.down.delete('interact');
    };

    const onPointerLockChange = (): void => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.down.clear();
    };

    const onBlur = (): void => {
      this.down.clear();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    this.listeners.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    });
  }

  attachTouch(controls: TouchControls): void {
    this.touch = controls;
  }

  get pointerLocked(): boolean {
    return this.locked;
  }

  get usingTouch(): boolean {
    return !!this.touch?.active;
  }

  requestPointerLock(): void {
    this.wantLock = true;
    if (this.locked) return;
    const request = this.element.requestPointerLock?.bind(this.element);
    try {
      const result = request?.() as unknown as Promise<void> | undefined;
      void result?.catch?.(() => undefined);
    } catch {
      /* Some browsers throw when the gesture is not trusted; the next click retries. */
    }
  }

  releasePointerLock(): void {
    this.wantLock = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  get wantsLock(): boolean {
    return this.wantLock;
  }

  /** Movement vector: x = strafe (+right), y = forward (+forward). */
  get move(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.enabled) {
      if (this.down.has('forward')) y += 1;
      if (this.down.has('back')) y -= 1;
      if (this.down.has('right')) x += 1;
      if (this.down.has('left')) x -= 1;
    }
    const stick = this.touch?.moveVector;
    if (stick) {
      x += stick.x;
      y += stick.y;
    }
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  /** Look delta in pixels, consumed on read. */
  consumeLook(): { x: number; y: number } {
    let x = this.lookX;
    let y = this.lookY;
    this.lookX = 0;
    this.lookY = 0;
    const touchLook = this.touch?.consumeLook();
    if (touchLook) {
      x += touchLook.x;
      y += touchLook.y;
    }
    return { x, y };
  }

  isDown(action: Action): boolean {
    if (action === 'sprint' && this.touch?.sprintHeld) return true;
    if (action === 'objective' && this.touch?.objectiveHeld) return true;
    return this.down.has(action);
  }

  wasPressed(action: Action): boolean {
    if (this.pressed.has(action)) return true;
    if (this.touch?.consumePressed(action)) return true;
    return false;
  }

  /** Clears one-frame edges. Call at the very end of the frame. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.touch?.endFrame();
  }

  clear(): void {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
    this.lookX = 0;
    this.lookY = 0;
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners = [];
  }
}
