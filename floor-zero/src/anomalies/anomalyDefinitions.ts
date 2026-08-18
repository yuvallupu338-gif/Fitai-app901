import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { Routine } from '../core/Sequencer';
import { localized } from '../data/dialogue';
import { rememberedRoomLine } from '../world/Memory';
import { CORRIDOR } from '../world/floorPlan';

export interface AnomalyDef {
  id: string;
  /** Earliest chapter this may appear in. */
  minChapter: number;
  /** Relative likelihood when several are eligible. */
  weight: number;
  /** Extra seconds before this specific one may repeat. */
  cooldown: number;
  /** Restrict to these room ids (empty = anywhere). */
  rooms?: string[];
  /** True when the anomaly needs the player to be looking elsewhere. */
  unobserved?: boolean;
  /**
   * True for the ones that are meant to land as a jolt. Everything else passes
   * without a sting or a camera kick, because an anomaly the game points at is
   * an anomaly the player knows happened — and the quiet ones only work while
   * you are still deciding whether you imagined them.
   */
  startle?: boolean;
  /** Guard: is the world in a state where this makes sense right now? */
  canRun?: (ctx: GameContext) => boolean;
  /** Do it. Returns an optional routine for anything that takes time. */
  run: (ctx: GameContext) => Routine | void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const scratch = new THREE.Vector3();

export function isLookingAt(ctx: GameContext, target: THREE.Object3D, cone = 0.55): boolean {
  target.getWorldPosition(scratch);
  const toTarget = scratch.clone().sub(ctx.camera.position);
  const distance = toTarget.length();
  if (distance > 26) return false;
  toTarget.normalize();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
  if (forward.dot(toTarget) < cone) return false;
  const collision = ctx.world.collision;
  if (!collision) return true;
  return collision.hasLineOfSight(
    ctx.camera.position.x,
    ctx.camera.position.z,
    scratch.x,
    scratch.z,
    1.5,
  );
}

export function isLookingAway(ctx: GameContext, target: THREE.Object3D): boolean {
  return !isLookingAt(ctx, target, 0.2);
}

function prop(ctx: GameContext, name: string): THREE.Object3D | undefined {
  return ctx.world.prop(name);
}

function corridorOnly(ctx: GameContext): boolean {
  return ctx.world.levelId === 'floor0';
}

function behindPlayer(ctx: GameContext, distance = 3): THREE.Vector3 {
  return new THREE.Vector3(
    ctx.camera.position.x - ctx.player.forward.x * distance,
    0,
    ctx.camera.position.z - ctx.player.forward.z * distance,
  );
}

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

export const ANOMALIES: AnomalyDef[] = [
  {
    id: 'photo_change',
    minChapter: 1,
    weight: 10,
    cooldown: 70,
    unobserved: true,
    canRun: (ctx) => !!prop(ctx, 'family_photo'),
    run: (ctx) => {
      const photo = prop(ctx, 'family_photo');
      if (!photo) return;
      const setVariant = (photo.userData as { setVariant?: (variant: number) => void }).setVariant;
      const next = 1 + (ctx.state.bump('photo_variant') % 4);
      setVariant?.(next);
    },
  },
  {
    id: 'extra_door',
    minChapter: 1,
    weight: 8,
    cooldown: 200,
    unobserved: true,
    canRun: (ctx) => !!prop(ctx, 'alcove_seal') && prop(ctx, 'alcove_seal')!.visible,
    run: (ctx) => {
      const seal = prop(ctx, 'alcove_seal');
      const door = prop(ctx, 'door_alcove');
      if (!seal || !door) return;
      seal.visible = false;
      ctx.world.collision?.setSolid('alcove_seal', false);
      door.visible = true;
      ctx.interactions.setEnabled('door_alcove', true);
      ctx.audio.play('creak', { position: door.position.clone(), volume: 0.5 });
    },
  },
  {
    id: 'plate_change',
    minChapter: 1,
    weight: 9,
    cooldown: 90,
    unobserved: true,
    canRun: (ctx) => !!prop(ctx, 'plate_04'),
    run: (ctx) => {
      const plate = prop(ctx, 'plate_04');
      const setText = (plate?.userData as { setText?: (text: string) => void } | undefined)?.setText;
      setText?.('00');
    },
  },
  {
    id: 'chair_move',
    minChapter: 1,
    weight: 11,
    cooldown: 55,
    unobserved: true,
    canRun: (ctx) => !!prop(ctx, 'corridor_chair'),
    run: (ctx) => {
      const chair = prop(ctx, 'corridor_chair');
      if (!chair) return;
      const shift = ctx.rng.range(0.5, 1.4) * (ctx.rng.chance(0.5) ? 1 : -1);
      chair.position.x += shift;
      chair.position.z = ctx.rng.range(-0.95, 0.95);
      chair.rotation.y += ctx.rng.range(0.6, 2.2);
      ctx.world.collision?.remove('corridor_chair');
      ctx.world.collision?.add({
        id: 'corridor_chair',
        minX: chair.position.x - 0.26,
        maxX: chair.position.x + 0.26,
        minY: 0,
        maxY: 0.9,
        minZ: chair.position.z - 0.26,
        maxZ: chair.position.z + 0.26,
        solid: true,
      });
      ctx.audio.play('chair_scrape', { position: chair.position.clone(), volume: 0.55 });
      ctx.mimic.noteNoise(chair.position.clone());
    },
  },
  {
    id: 'light_behind',
    minChapter: 1,
    weight: 14,
    cooldown: 40,
    run: (ctx) => {
      const id = ctx.world.lighting.fixtureBehind(ctx.camera.position, ctx.player.forward);
      if (!id) return;
      ctx.world.lighting.flicker(id, 0.7, 1);
      ctx.world.lighting.setOn(id, false);
      ctx.audio.play('power_down', { volume: 0.35 });
      ctx.mimic.noteFlicker();
    },
  },
  {
    id: 'shadow_under_door',
    minChapter: 1,
    weight: 12,
    cooldown: 60,
    canRun: (ctx) => !!prop(ctx, 'door_shadow'),
    run: function* (ctx): Routine {
      const shadow = prop(ctx, 'door_shadow');
      if (!shadow) return;
      const material = (shadow as THREE.Mesh).material as THREE.MeshBasicMaterial;
      shadow.visible = true;
      material.opacity = 0;
      const startZ = CORRIDOR.z0 + 0.4;
      shadow.position.set(4.3, 0.02, startZ);
      for (let step = 0; step < 44; step++) {
        material.opacity = Math.min(0.8, material.opacity + 0.05);
        shadow.position.x += 0.028;
        yield 0.03;
      }
      for (let step = 0; step < 16; step++) {
        material.opacity = Math.max(0, material.opacity - 0.06);
        yield 0.03;
      }
      shadow.visible = false;
    },
  },
  {
    id: 'steps_above',
    minChapter: 1,
    weight: 13,
    cooldown: 45,
    run: function* (ctx): Routine {
      const origin = new THREE.Vector3(ctx.camera.position.x, 3.4, ctx.camera.position.z);
      for (let step = 0; step < 7; step++) {
        origin.x += 0.8;
        ctx.audio.play('step_wood', { position: origin.clone(), volume: 0.55, rate: 0.72 });
        yield 0.46;
      }
      ctx.mimic.noteNoise(new THREE.Vector3(origin.x, 0, origin.z));
    },
  },
  {
    id: 'camera_follow',
    minChapter: 1,
    weight: 12,
    cooldown: 50,
    canRun: (ctx) => !!prop(ctx, 'corridor_camera_head'),
    run: function* (ctx): Routine {
      const head = prop(ctx, 'corridor_camera_head');
      if (!head) return;
      ctx.audio.play('camera_servo', { position: head.getWorldPosition(new THREE.Vector3()), volume: 0.7 });
      for (let step = 0; step < 90; step++) {
        const world = head.getWorldPosition(new THREE.Vector3());
        const wanted = Math.atan2(ctx.camera.position.x - world.x, ctx.camera.position.z - world.z);
        head.rotation.y = wanted - Math.PI;
        yield 0.04;
      }
      ctx.tension.add(4);
    },
  },
  {
    id: 'window_corridor',
    minChapter: 2,
    weight: 8,
    cooldown: 150,
    unobserved: true,
    canRun: (ctx) => !!prop(ctx, 'corridor_window'),
    run: (ctx) => {
      const window = prop(ctx, 'corridor_window') as THREE.Mesh | undefined;
      if (!window) return;
      const material = window.material as THREE.MeshBasicMaterial;
      const data = window.userData as { corridorTexture?: THREE.Texture; rainTexture?: THREE.Texture };
      material.map = material.map === data.corridorTexture ? data.rainTexture! : data.corridorTexture!;
      material.needsUpdate = true;
    },
  },
  {
    id: 'late_reflection',
    minChapter: 2,
    weight: 7,
    cooldown: 120,
    canRun: (ctx) => {
      const rig = ctx.world.current?.elevator;
      if (!rig || !prop(ctx, 'mirror_ghost')) return false;
      return Math.hypot(ctx.camera.position.x - rig.interior.x, ctx.camera.position.z - rig.interior.z) < 3;
    },
    run: function* (ctx): Routine {
      const ghost = prop(ctx, 'mirror_ghost');
      if (!ghost) return;
      const material = (ghost as THREE.Mesh).material as THREE.MeshBasicMaterial;
      ghost.visible = true;
      material.opacity = 0;
      // Fades in a beat too late, then is simply gone.
      yield 1.1;
      for (let step = 0; step < 20; step++) {
        material.opacity = Math.min(0.55, material.opacity + 0.03);
        yield 0.05;
      }
      yield 1.6;
      material.opacity = 0;
      ghost.visible = false;
      ctx.tension.add(8);
    },
  },
  {
    id: 'mimic_in_mirror',
    minChapter: 3,
    weight: 7,
    cooldown: 140,
    canRun: (ctx) => !!prop(ctx, 'mirror_ghost'),
    run: function* (ctx): Routine {
      const ghost = prop(ctx, 'mirror_ghost');
      if (!ghost) return;
      const material = (ghost as THREE.Mesh).material as THREE.MeshBasicMaterial;
      ghost.visible = true;
      material.opacity = 0.75;
      ctx.audio.play('glitch', { volume: 0.3 });
      yield 0.22;
      material.opacity = 0;
      ghost.visible = false;
      ctx.tension.add(11);
    },
  },
  {
    id: 'phone_ring',
    startle: true,
    minChapter: 3,
    weight: 9,
    cooldown: 110,
    canRun: (ctx) => !!prop(ctx, 'apt03_phone'),
    run: (ctx) => {
      const phone = prop(ctx, 'apt03_phone');
      if (!phone) return;
      const position = phone.getWorldPosition(new THREE.Vector3());
      ctx.audio.play('phone', { position, volume: 1 });
      ctx.mimic.noteNoise(position);
    },
  },
  {
    id: 'short_corridor',
    minChapter: 2,
    weight: 8,
    cooldown: 160,
    canRun: (ctx) =>
      corridorOnly(ctx) && !!prop(ctx, 'false_end_wall') && ctx.camera.position.x < 6.5,
    run: function* (ctx): Routine {
      const wall = prop(ctx, 'false_end_wall');
      if (!wall) return;
      wall.visible = true;
      ctx.world.collision?.setSolid('false_end_wall', true);
      ctx.audio.play('thud', { volume: 0.4 });
      ctx.tension.add(12);
      // It stays until the player turns away from it.
      yield () => isLookingAway(ctx, wall) || ctx.camera.position.x > 8.6;
      yield 0.6;
      wall.visible = false;
      ctx.world.collision?.setSolid('false_end_wall', false);
    },
  },
  {
    id: 'apartment_swap',
    minChapter: 3,
    weight: 6,
    cooldown: 180,
    unobserved: true,
    canRun: (ctx) => !!prop(ctx, 'plate_04'),
    run: (ctx) => {
      const plate = prop(ctx, 'plate_04');
      const setText = (plate?.userData as { setText?: (text: string) => void } | undefined)?.setText;
      setText?.(ctx.rng.pick(['01', '03', '0']));
      ctx.audio.play('glitch', { volume: 0.22 });
    },
  },
  {
    id: 'item_returns',
    minChapter: 2,
    weight: 7,
    cooldown: 150,
    unobserved: true,
    canRun: (ctx) => ctx.state.flag('floor_power') && !ctx.state.flag('fuse_returned'),
    run: (ctx) => {
      const fuse = ctx.interactions.get('fuse');
      if (!fuse) return;
      ctx.state.setFlag('fuse_returned');
      fuse.enabled = true;
      (fuse.hitbox as THREE.Mesh).visible = true;
      ctx.audio.play('creak', { volume: 0.3 });
    },
  },
  {
    id: 'knock_rhythm',
    startle: true,
    minChapter: 1,
    weight: 12,
    cooldown: 55,
    run: function* (ctx): Routine {
      const source = behindPlayer(ctx, 2.6);
      source.y = 1.4;
      for (let step = 0; step < 3; step++) {
        ctx.audio.play('knock', { position: source.clone(), volume: 0.8 });
        yield 1.5;
      }
      ctx.mimic.noteNoise(source);
    },
  },
  {
    id: 'figure_at_end',
    startle: true,
    minChapter: 2,
    weight: 9,
    cooldown: 120,
    canRun: (ctx) => corridorOnly(ctx) && !!prop(ctx, 'hall_figure') && ctx.camera.position.x < 18,
    run: function* (ctx): Routine {
      const figure = prop(ctx, 'hall_figure');
      if (!figure) return;
      figure.position.set(25.4, 0.93, 0);
      figure.visible = true;
      ctx.tension.add(14);
      yield () => isLookingAt(ctx, figure, 0.75) || ctx.player.idleTime > 6;
      yield 1.4;
      ctx.world.lighting.flicker('corridor_light_6', 0.5);
      yield 0.5;
      figure.visible = false;
      ctx.audio.play('sub_drop', { volume: 0.45 });
    },
  },
  {
    id: 'screen_unopened',
    minChapter: 3,
    weight: 7,
    cooldown: 100,
    canRun: (ctx) => ctx.world.feeds.length > 0,
    run: (ctx) => {
      const feed = ctx.rng.pick(ctx.world.feeds);
      feed.setKind('unopened');
      feed.glitch(1.2);
    },
  },
  {
    id: 'board_message',
    minChapter: 2,
    weight: 8,
    cooldown: 200,
    unobserved: true,
    canRun: (ctx) => !!prop(ctx, 'corridor_board'),
    run: (ctx) => {
      const board = prop(ctx, 'corridor_board');
      const setMessage = (board?.userData as { setMessage?: (message: string) => void } | undefined)
        ?.setMessage;
      setMessage?.(ctx.rng.pick(['אל תחזור', 'קומה 0 מלאה', 'הוא כבר בפנים', 'ראינו אותך אתמול']));
    },
  },
  {
    id: 'mimic_preempts',
    startle: true,
    minChapter: 3,
    weight: 8,
    cooldown: 90,
    canRun: (ctx) => ctx.mimic.isActive,
    run: (ctx) => {
      const target = ctx.mimic.predictDestination(ctx);
      if (!target) return;
      let bestId: string | null = null;
      let bestDistance = 3.5;
      for (const item of ctx.interactions.all) {
        if (item.kind !== 'door' || !item.enabled) continue;
        const world = item.hitbox.getWorldPosition(new THREE.Vector3());
        const distance = Math.hypot(world.x - target.x, world.z - target.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = item.id;
        }
      }
      if (!bestId) return;
      ctx.interactions.replay(bestId);
      ctx.bus.emit('mimic_deviation', { kind: 'preempted_you' });
      ctx.tension.add(10);
    },
  },
  {
    id: 'door_closes_slowly',
    minChapter: 1,
    weight: 11,
    cooldown: 60,
    run: (ctx) => {
      const build = ctx.world.current;
      if (!build) return;
      const open = build.doors.all.filter((door) => door.open && !door.id.startsWith('lift'));
      if (open.length === 0) return;
      const door = ctx.rng.pick(open);
      door.setOpen(false);
      ctx.audio.play('door_wood_close', {
        position: door.pivot.position.clone(),
        volume: 0.45,
      });
    },
  },
  {
    id: 'shadow_wrong',
    startle: true,
    minChapter: 2,
    weight: 9,
    cooldown: 90,
    canRun: (ctx) => !!prop(ctx, 'wrong_shadow'),
    run: function* (ctx): Routine {
      const shadow = prop(ctx, 'wrong_shadow');
      if (!shadow) return;
      const material = (shadow as THREE.Mesh).material as THREE.MeshBasicMaterial;
      shadow.visible = true;
      material.opacity = 0;
      const start = new THREE.Vector3(
        ctx.camera.position.x + ctx.player.forward.x * 1.3,
        0.02,
        ctx.camera.position.z + ctx.player.forward.z * 1.3,
      );
      shadow.position.copy(start);
      // It starts where a shadow should be, then walks off on its own.
      const drift = new THREE.Vector3(-ctx.player.forward.z, 0, ctx.player.forward.x).multiplyScalar(0.035);
      for (let step = 0; step < 50; step++) {
        material.opacity = Math.min(0.7, material.opacity + 0.04);
        shadow.position.add(drift);
        yield 0.04;
      }
      for (let step = 0; step < 14; step++) {
        material.opacity = Math.max(0, material.opacity - 0.06);
        yield 0.04;
      }
      shadow.visible = false;
      ctx.tension.add(7);
    },
  },
  {
    id: 'lift_voice',
    minChapter: 2,
    weight: 8,
    cooldown: 130,
    canRun: (ctx) => corridorOnly(ctx) && ctx.camera.position.x > 5,
    run: function* (ctx): Routine {
      const rig = ctx.world.current?.elevator;
      if (!rig) return;
      const voice = ctx.audio.play('whisper', {
        position: rig.interior.clone().setY(1.5),
        volume: 0.85,
        loop: true,
      });
      ctx.mimic.noteNoise(rig.interior.clone());
      yield 4.5;
      ctx.audio.stop(voice, 1.2);
      ctx.tension.add(9);
    },
  },
  {
    id: 'clock_advances',
    minChapter: 3,
    weight: 7,
    cooldown: 80,
    unobserved: true,
    canRun: (ctx) => !!ctx.interactions.get('clock_1'),
    run: (ctx) => {
      // Only the ones the player is not watching move.
      for (const id of ['clock_1', 'clock_2', 'clock_3', 'clock_4']) {
        const clock = ctx.interactions.get(id);
        if (!clock) continue;
        if (isLookingAt(ctx, clock.hitbox, 0.4)) continue;
        ctx.audio.play('clock_tick', {
          position: clock.hitbox.getWorldPosition(new THREE.Vector3()),
          volume: 0.5,
        });
      }
    },
  },
  {
    id: 'own_footsteps',
    minChapter: 1,
    weight: 13,
    cooldown: 65,
    canRun: (ctx) => corridorOnly(ctx) && ctx.player.motion === 0,
    run: function* (ctx): Routine {
      // Three steps closing in from behind after the player has already stopped
      // walking, and then nothing. The sound follows the surface they are on.
      const surface = ctx.world.surfaceAt(ctx.camera.position.x, ctx.camera.position.z);
      const step =
        surface === 'wood' ? 'step_wood' : surface === 'carpet' ? 'step_carpet' : 'step_terrazzo';
      const origin = behindPlayer(ctx, 4.2);
      for (let i = 0; i < 3; i++) {
        origin.x += ctx.player.forward.x * 1.15;
        origin.z += ctx.player.forward.z * 1.15;
        ctx.audio.play(step, { position: origin.clone(), volume: 0.6 - i * 0.08, rate: 0.94 });
        yield 0.52;
      }
      ctx.mimic.noteNoise(origin.clone());
      ctx.tension.add(6);
    },
  },
  {
    id: 'doors_ajar',
    minChapter: 2,
    weight: 9,
    cooldown: 170,
    canRun: (ctx) => corridorOnly(ctx) && !!ctx.world.doors,
    run: function* (ctx): Routine {
      const doors = ctx.world.doors;
      if (!doors) return;
      // Apartment doors only: the shutter, the service door and the control
      // door all gate progress and must never open themselves.
      const openable = doors.all.filter(
        (door) => /^door_apt/.test(door.id) && !door.locked && !door.open,
      );
      if (openable.length === 0) return;
      for (const door of openable) {
        door.setOpen(true);
        ctx.audio.play('creak', {
          position: door.pivot.getWorldPosition(new THREE.Vector3()),
          volume: 0.45,
        });
        yield 0.75;
      }
      ctx.tension.add(10);
    },
  },
  {
    id: 'lift_counts_down',
    minChapter: 2,
    weight: 8,
    cooldown: 150,
    canRun: (ctx) => {
      const rig = ctx.world.current?.elevator;
      if (!rig || !corridorOnly(ctx)) return false;
      // Only worth doing from far enough away that walking back is a decision.
      return Math.hypot(ctx.camera.position.x - rig.interior.x, ctx.camera.position.z - rig.interior.z) > 9;
    },
    run: function* (ctx): Routine {
      const rig = ctx.world.current?.elevator;
      if (!rig) return;
      for (const floor of ['-1', '-2', '-3', '-4']) {
        ctx.world.elevator.setDisplay(floor);
        ctx.audio.play('lift_bell', { position: rig.interior.clone().setY(1.6), volume: 0.35 });
        yield 1.1;
      }
      ctx.world.elevator.glitchDisplay(1.6);
      yield 1.6;
      ctx.world.elevator.setDisplay('0');
      ctx.tension.add(8);
    },
  },
  {
    id: 'light_walk',
    startle: true,
    minChapter: 2,
    weight: 11,
    cooldown: 95,
    canRun: (ctx) => corridorOnly(ctx) && ctx.world.roomAt(ctx.camera.position.x, ctx.camera.position.z) === 'corridor',
    run: function* (ctx): Routine {
      const lighting = ctx.world.lighting;
      // Corridor tubes are numbered west to east, so walking the list backwards
      // reads as something coming up the corridor toward the lift.
      const ids = lighting
        .fixtureIds()
        .filter((id) => id.startsWith('corridor_light_'))
        .sort((a, b) => Number(b.split('_').pop()) - Number(a.split('_').pop()));
      if (ids.length === 0) return;
      const wasOn = ids.map((id) => lighting.isOn(id));
      for (let i = 0; i < ids.length; i++) {
        if (!wasOn[i]) continue;
        lighting.flicker(ids[i], 0.3, 1);
        lighting.setOn(ids[i], false);
        ctx.audio.play('switch', { volume: 0.3 });
        yield 0.34;
      }
      yield 1.4;
      // And back on all at once, which is the part that lands.
      for (let i = 0; i < ids.length; i++) if (wasOn[i]) lighting.setOn(ids[i], true);
      ctx.audio.play('power_up', { volume: 0.5 });
      ctx.tension.add(12);
    },
  },
  {
    id: 'whisper_objective',
    minChapter: 3,
    weight: 9,
    cooldown: 120,
    canRun: (ctx) => corridorOnly(ctx) && ctx.state.objective.length > 0,
    run: function* (ctx): Routine {
      const behind = behindPlayer(ctx, 2.4).setY(1.55);
      const voice = ctx.audio.play('whisper', { position: behind, volume: 0.9 });
      yield 0.55;
      // The floor reads the player's own objective back to them, unprompted.
      ctx.say(`«${ctx.state.objective}»`, 3.4);
      yield 2.4;
      ctx.audio.stop(voice, 0.8);
      ctx.tension.add(11);
    },
  },
  {
    id: 'wall_faces',
    minChapter: 2,
    weight: 10,
    cooldown: 130,
    canRun: (ctx) => corridorOnly(ctx) && !!prop(ctx, 'wall_faces'),
    run: function* (ctx): Routine {
      const anchor = prop(ctx, 'wall_faces');
      const faces = (anchor?.userData as { all?: THREE.Mesh[] } | undefined)?.all;
      if (!faces?.length) return;

      // They surface one after another along the corridor, in the order the
      // player would walk it, and sink back before anyone reaches them.
      const materials = faces.map((face) => face.material as THREE.MeshBasicMaterial);
      for (const face of faces) face.visible = true;
      for (const material of materials) material.opacity = 0;

      for (let index = 0; index < faces.length; index++) {
        const material = materials[index];
        for (let step = 0; step < 12; step++) {
          material.opacity = Math.min(0.82, material.opacity + 0.07);
          yield 0.035;
        }
        ctx.audio.play('creak', {
          position: faces[index].getWorldPosition(new THREE.Vector3()),
          volume: 0.28,
        });
        yield 0.25;
      }

      yield 1.6;
      for (let step = 0; step < 26; step++) {
        for (const material of materials) material.opacity = Math.max(0, material.opacity - 0.035);
        yield 0.04;
      }
      for (const face of faces) face.visible = false;
      ctx.tension.add(14);
    },
  },
  {
    id: 'writing_bleeds',
    minChapter: 2,
    weight: 9,
    cooldown: 160,
    canRun: (ctx) => corridorOnly(ctx) && !!prop(ctx, 'wall_bleed'),
    run: function* (ctx): Routine {
      const bleed = prop(ctx, 'wall_bleed') as THREE.Mesh | undefined;
      if (!bleed) return;
      const material = bleed.material as THREE.MeshBasicMaterial;
      bleed.visible = true;
      material.opacity = 0;
      // Slow: it soaks through rather than appearing.
      for (let step = 0; step < 60; step++) {
        material.opacity = Math.min(0.9, material.opacity + 0.016);
        yield 0.06;
      }
      yield 3.5;
      for (let step = 0; step < 40; step++) {
        material.opacity = Math.max(0, material.opacity - 0.024);
        yield 0.05;
      }
      bleed.visible = false;
      ctx.tension.add(12);
    },
  },
  {
    id: 'floor_floods',
    startle: true,
    minChapter: 3,
    weight: 8,
    cooldown: 210,
    canRun: (ctx) =>
      corridorOnly(ctx) && !!prop(ctx, 'black_water') &&
      ctx.world.roomAt(ctx.camera.position.x, ctx.camera.position.z) === 'corridor',
    run: function* (ctx): Routine {
      const water = prop(ctx, 'black_water') as THREE.Mesh | undefined;
      if (!water) return;
      const material = water.material as THREE.MeshBasicMaterial;
      water.visible = true;
      material.opacity = 0;
      ctx.audio.play('sub_drop', { volume: 0.3 });
      for (let step = 0; step < 30; step++) {
        material.opacity = Math.min(0.92, material.opacity + 0.032);
        // A slow drift, so the surface is never quite still.
        water.position.z = Math.sin(step * 0.2) * 0.03;
        yield 0.05;
      }
      yield 4;
      for (let step = 0; step < 30; step++) {
        material.opacity = Math.max(0, material.opacity - 0.032);
        yield 0.05;
      }
      water.visible = false;
      water.position.z = 0;
      ctx.tension.add(16);
    },
  },
  {
    id: 'chair_rises',
    startle: true,
    minChapter: 3,
    weight: 8,
    cooldown: 190,
    unobserved: true,
    canRun: (ctx) => !!prop(ctx, 'corridor_chair'),
    run: function* (ctx): Routine {
      const chair = prop(ctx, 'corridor_chair');
      if (!chair) return;
      const restY = chair.position.y;
      ctx.world.collision?.setSolid('corridor_chair', false);
      ctx.audio.play('chair_scrape', { position: chair.position.clone(), volume: 0.5 });

      // Up to just under the ceiling, turning as it goes.
      for (let step = 0; step < 46; step++) {
        chair.position.y = restY + (step / 45) * 1.9;
        chair.rotation.y += 0.03;
        chair.rotation.z = (step / 45) * 0.4;
        yield 0.045;
      }
      // And it hangs there, which is the part that is wrong.
      yield 3.4;
      // Then it is simply dropped. Under gravity, not lowered.
      const top = chair.position.y;
      let fall = 0;
      while (chair.position.y > restY) {
        fall += 9.81 * 0.03;
        chair.position.y = Math.max(restY, top - fall * 0.03 * 12);
        chair.rotation.y += 0.05;
        yield 0.03;
      }
      chair.position.y = restY;
      chair.rotation.z = 0;
      ctx.audio.play('thud', { position: chair.position.clone(), volume: 0.85 });
      ctx.world.collision?.setSolid('corridor_chair', true);
      ctx.mimic.noteNoise(chair.position.clone());
      ctx.tension.add(18);
    },
  },
  {
    id: 'crawler_arrives',
    startle: true,
    minChapter: 2,
    weight: 7,
    cooldown: 260,
    canRun: (ctx) => ctx.creatures.canSend(ctx, 'crawler'),
    run: function* (ctx): Routine {
      // It announces itself once, from a long way off, and then not again.
      const behind = behindPlayer(ctx, 12).setY(0.4);
      ctx.audio.play('shriek', { position: behind, volume: 0.45 });
      ctx.world.lighting.flicker('*', 1.1, 0.8);
      yield 2.2;
      ctx.creatures.send(ctx, 'crawler');
    },
  },
  {
    id: 'tall_one_arrives',
    startle: true,
    minChapter: 3,
    weight: 6,
    cooldown: 300,
    canRun: (ctx) => ctx.creatures.canSend(ctx, 'tall'),
    run: function* (ctx): Routine {
      // No warning sound for this one. The lights simply go, and it is there.
      ctx.world.lighting.blackout(1.6);
      yield 1.4;
      ctx.creatures.send(ctx, 'tall');
    },
  },
  {
    id: 'right_behind_you',
    minChapter: 2,
    weight: 11,
    cooldown: 115,
    canRun: (ctx) => corridorOnly(ctx) && !ctx.mimic.isChasing && ctx.mimic.closeBehind < 0.05,
    run: (ctx) => {
      // No approach, no sound, no warning: it is simply there now.
      ctx.mimic.snapBehind(ctx);
    },
  },
  {
    id: 'stands_at_the_end',
    minChapter: 2,
    weight: 12,
    cooldown: 100,
    canRun: (ctx) =>
      corridorOnly(ctx) &&
      !ctx.mimic.isChasing &&
      !ctx.mimic.isStandingWatch &&
      // Only worth doing if the far end is somewhere they have to look.
      ctx.camera.position.x < 19,
    run: (ctx) => {
      ctx.mimic.standWatching(ctx, 26 + ctx.rng.range(0, 14));
    },
  },
  {
    id: 'board_remembers',
    minChapter: 3,
    weight: 8,
    cooldown: 200,
    unobserved: true,
    canRun: (ctx) => !!prop(ctx, 'corridor_board'),
    run: (ctx) => {
      const board = prop(ctx, 'corridor_board');
      const setMessage = (board?.userData as { setMessage?: (message: string) => void } | undefined)
        ?.setMessage;
      if (!setMessage) return;
      const room = ctx.world.room || 'corridor';
      setMessage(localized(rememberedRoomLine(room)));
      ctx.audio.play('paper', { volume: 0.4 });
    },
  },
];

export const ANOMALY_COUNT = ANOMALIES.length;
