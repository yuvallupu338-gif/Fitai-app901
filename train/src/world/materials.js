/*
 * materials.js — the material table.
 *
 * Every key here matches a material group name used by a builder in
 * carriage.js, passengers.js or outside.js. Textures are referenced by *name*
 * rather than by object, so a texture can be redrawn under a running material
 * without anything being rebound: that is the mechanism behind every changing
 * sign, map and advertisement in the game.
 */

export function trainMaterials() {
  const glass = (side) => ({
    glass: side,
    glassTint: [0.030, 0.038, 0.052],
    reflStrength: side === 'plain' ? 0.30 : 0.72,
    smudge: 1,
    cull: false,
    transparent: true,
  });

  return {
    default: { map: 'wall', specular: 0.05 },

    floor: { map: 'floor', uvScale: [1, 1], specular: 0.16, shininess: 26 },
    doorLine: { map: null, color: [0.72, 0.60, 0.12], specular: 0.10 },
    ceiling: { map: 'ceiling', specular: 0.03, shininess: 10 },
    wall: { map: 'wall', specular: 0.09, shininess: 20 },
    metal: { map: 'metal', specular: 0.34, shininess: 46 },
    darkMetal: { map: 'metal', color: [0.26, 0.28, 0.31], specular: 0.22, shininess: 34 },
    seat: { map: 'seat', specular: 0.02, shininess: 6 },
    pole: { map: 'metal', color: [0.90, 0.93, 0.98], specular: 0.62, shininess: 90 },
    handle: { map: 'metal', color: [0.70, 0.72, 0.76], specular: 0.40, shininess: 50 },
    strap: { map: 'cloth', color: [0.10, 0.11, 0.14], specular: 0.04 },
    doorPanel: { map: 'wall', color: [0.74, 0.77, 0.80], specular: 0.14, shininess: 26 },
    doorRubber: { map: 'metal', color: [0.08, 0.08, 0.09], specular: 0.04 },
    bellows: { map: 'metal', color: [0.13, 0.14, 0.16], specular: 0.05 },
    emergency: { map: null, color: [0.62, 0.07, 0.06], specular: 0.45, shininess: 60 },
    lens: { map: null, color: [0.015, 0.015, 0.02], specular: 0.95, shininess: 140 },
    camLed: { map: null, unlit: true, color: [1, 0.1, 0.08], emissive: [1, 0.12, 0.10], emissiveScale: 1.4 },
    notice: { map: 'notice', specular: 0.10 },
    graffiti: { map: 'graffiti', transparent: true, specular: 0, hidden: true, alphaCutoff: 0.02 },

    lightStrip: {
      map: 'lightPanel', unlit: true, emissive: [1.0, 1.0, 1.0], emissiveScale: 1.35,
    },

    'glass.left': glass('left'),
    'glass.right': glass('right'),
    'glass.plain': glass('plain'),

    'map.left': { map: 'routemap', specular: 0.30, shininess: 60 },
    'map.right': { map: 'routemap', specular: 0.30, shininess: 60 },

    'display.front': { map: 'display', unlit: true, emissive: [1, 1, 1], emissiveScale: 0.85 },
    'display.back': { map: 'display', unlit: true, emissive: [1, 1, 1], emissiveScale: 0.85 },

    ad0: { map: 'ad:0', specular: 0.22, shininess: 40 },
    ad1: { map: 'ad:1', specular: 0.22, shininess: 40 },
    ad2: { map: 'ad:2', specular: 0.22, shininess: 40 },
    ad3: { map: 'ad:3', specular: 0.22, shininess: 40 },

    /* people */
    coat: { map: 'cloth', color: [0.22, 0.24, 0.30], specular: 0.05, shininess: 10 },
    legs: { map: 'cloth', color: [0.14, 0.15, 0.18], specular: 0.04 },
    shoes: { map: 'cloth', color: [0.06, 0.06, 0.07], specular: 0.22, shininess: 40 },
    skin: { map: 'face', color: [0.78, 0.64, 0.56], specular: 0.10, shininess: 22 },
    hair: { map: 'cloth', color: [0.14, 0.11, 0.10], specular: 0.10, shininess: 18 },
    gear: { map: 'cloth', color: [0.10, 0.10, 0.12], specular: 0.20 },
    prop: { map: 'newspaper', specular: 0.04 },
    screen: { map: null, unlit: true, emissive: [0.55, 0.75, 1.0], emissiveScale: 1.0 },
    shadow: { map: 'blob', transparent: true, unlit: true, color: [0, 0, 0], specular: 0, cull: false },

    /* outside */
    tunnel: { map: 'tunnel', specular: 0.03 },
    ballast: { map: 'concrete', color: [0.45, 0.45, 0.46], specular: 0.02 },
    rail: { map: 'metal', color: [0.55, 0.54, 0.52], specular: 0.55, shininess: 70 },
    sleeper: { map: 'concrete', color: [0.52, 0.50, 0.47], specular: 0.02 },
    cable: { map: 'metal', color: [0.16, 0.16, 0.18], specular: 0.10 },
    serviceLamp: { map: null, unlit: true, emissive: [1.0, 0.62, 0.24], emissiveScale: 1.1, color: [1, 0.7, 0.3] },
    platformFloor: { map: 'asphalt', specular: 0.30, shininess: 40 },
    platformTile: { map: 'tile', specular: 0.24, shininess: 42 },
    concrete: { map: 'concrete', specular: 0.05 },
    edgeStrip: { map: null, color: [0.66, 0.56, 0.14], specular: 0.16 },
    pillar: { map: 'tile', color: [0.86, 0.87, 0.86], specular: 0.16 },
    platformLamp: { map: 'lightPanel', unlit: true, emissive: [1, 1, 1], emissiveScale: 1.0 },
    platformBench: { map: 'cloth', color: [0.30, 0.26, 0.20], specular: 0.14 },
    platformAd: { map: 'ad:platform', specular: 0.20, shininess: 36 },
    sign: { map: 'stationSign', specular: 0.18, shininess: 40 },
  };
}
