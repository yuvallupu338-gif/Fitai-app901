import type { Action } from './InputManager';

interface Stick {
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

/**
 * On-screen controls for phones and tablets: a virtual stick on the left, a
 * free look area on the right, and the action buttons. Hidden entirely on
 * desktop so it never gets in the way.
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private stick: Stick | null = null;
  private lookPointer = -1;
  private lookX = 0;
  private lookY = 0;
  private held = new Set<Action>();
  private pressed = new Set<Action>();
  private visible = false;
  private used = false;
  private sensitivity = 1;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'touch-layer';
    this.root.dir = 'ltr';
    this.root.hidden = true;

    const lookZone = document.createElement('div');
    lookZone.className = 'touch-look';
    this.root.appendChild(lookZone);

    const moveZone = document.createElement('div');
    moveZone.className = 'touch-move';
    this.root.appendChild(moveZone);

    this.stickBase = document.createElement('div');
    this.stickBase.className = 'touch-stick';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'touch-knob';
    this.stickBase.appendChild(this.stickKnob);
    moveZone.appendChild(this.stickBase);

    const buttons = document.createElement('div');
    buttons.className = 'touch-buttons';
    this.root.appendChild(buttons);

    const makeButton = (label: string, action: Action, kind: 'tap' | 'hold', className = ''): HTMLButtonElement => {
      const button = document.createElement('button');
      button.className = `touch-button ${className}`.trim();
      button.textContent = label;
      button.type = 'button';
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.used = true;
        button.classList.add('is-active');
        if (kind === 'hold') this.held.add(action);
        else this.pressed.add(action);
      });
      const release = (event: Event): void => {
        event.preventDefault();
        button.classList.remove('is-active');
        if (kind === 'hold') this.held.delete(action);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
      buttons.appendChild(button);
      return button;
    };

    makeButton('E', 'interact', 'tap', 'touch-primary');
    makeButton('»', 'sprint', 'hold');
    makeButton('◐', 'flashlight', 'tap');
    makeButton('≡', 'objective', 'hold');

    const pause = document.createElement('button');
    pause.className = 'touch-pause';
    pause.type = 'button';
    pause.textContent = '⏸';
    pause.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.pressed.add('pause');
    });
    this.root.appendChild(pause);

    // Movement stick.
    moveZone.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.used = true;
      moveZone.setPointerCapture(event.pointerId);
      const rect = moveZone.getBoundingClientRect();
      this.stick = {
        pointerId: event.pointerId,
        originX: event.clientX - rect.left,
        originY: event.clientY - rect.top,
        x: 0,
        y: 0,
      };
      this.stickBase.style.left = `${this.stick.originX}px`;
      this.stickBase.style.top = `${this.stick.originY}px`;
      this.stickBase.classList.add('is-active');
      this.stickKnob.style.transform = 'translate(-50%, -50%)';
    });

    const moveHandler = (event: PointerEvent): void => {
      if (!this.stick || event.pointerId !== this.stick.pointerId) return;
      event.preventDefault();
      const rect = moveZone.getBoundingClientRect();
      const dx = event.clientX - rect.left - this.stick.originX;
      const dy = event.clientY - rect.top - this.stick.originY;
      const max = 58;
      const length = Math.hypot(dx, dy);
      const clamped = length > max ? max / length : 1;
      const kx = dx * clamped;
      const ky = dy * clamped;
      this.stick.x = kx / max;
      this.stick.y = -ky / max;
      this.stickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    };
    moveZone.addEventListener('pointermove', moveHandler);

    const endStick = (event: PointerEvent): void => {
      if (!this.stick || event.pointerId !== this.stick.pointerId) return;
      this.stick = null;
      this.stickBase.classList.remove('is-active');
      this.stickKnob.style.transform = 'translate(-50%, -50%)';
    };
    moveZone.addEventListener('pointerup', endStick);
    moveZone.addEventListener('pointercancel', endStick);

    // Look area.
    lookZone.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.used = true;
      if (this.lookPointer !== -1) return;
      this.lookPointer = event.pointerId;
      lookZone.setPointerCapture(event.pointerId);
    });
    lookZone.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.lookPointer) return;
      event.preventDefault();
      this.lookX += event.movementX || 0;
      this.lookY += event.movementY || 0;
    });
    const endLook = (event: PointerEvent): void => {
      if (event.pointerId !== this.lookPointer) return;
      this.lookPointer = -1;
    };
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);

    parent.appendChild(this.root);
  }

  static isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      (navigator.maxTouchPoints ?? 0) > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.hidden = !visible;
    if (!visible) {
      this.stick = null;
      this.held.clear();
      this.pressed.clear();
      this.lookX = 0;
      this.lookY = 0;
    }
  }

  get active(): boolean {
    return this.visible && this.used;
  }

  get moveVector(): { x: number; y: number } | null {
    if (!this.visible || !this.stick) return null;
    return { x: this.stick.x, y: this.stick.y };
  }

  consumeLook(): { x: number; y: number } | null {
    if (!this.visible) return null;
    const result = { x: this.lookX * this.sensitivity, y: this.lookY * this.sensitivity };
    this.lookX = 0;
    this.lookY = 0;
    return result;
  }

  get sprintHeld(): boolean {
    return this.held.has('sprint');
  }

  get objectiveHeld(): boolean {
    return this.held.has('objective');
  }

  consumePressed(action: Action): boolean {
    if (!this.pressed.has(action)) return false;
    this.pressed.delete(action);
    return true;
  }

  endFrame(): void {
    this.pressed.clear();
  }

  dispose(): void {
    this.root.remove();
  }
}
