import type { PhotoSkin } from './types'

/** Rendered "Nexus" field radio. Coordinates measured on the 887×1774 base image. */
export const nexusSkin: PhotoSkin = {
  width: 887,
  height: 1774,
  base: '/skins/nexus/base.jpg',
  backdrop: '#0b0d0e',
  edgeFade: 0.035,
  tone: 'brightness(1.16) contrast(1.04) saturate(1.15)',

  screen: { x: 116, y: 218, w: 662, h: 818, r: 28 },
  screenLayoutWidth: 326,

  led: { x: 700, y: 136, w: 35, h: 15, r: 7.5 },
  sideLights: {
    left: { x: 124, y: 450, w: 8, h: 300, r: 4 },
    right: { x: 762, y: 450, w: 8, h: 300, r: 4 },
  },
  talkLights: {
    top: { x: 369, y: 1149, w: 152, h: 13, r: 6.5 },
    bottom: { x: 369, y: 1551, w: 150, h: 14, r: 7 },
  },

  pause: {
    center: { x: 162, y: 1293 },
    radius: 56,
    iconPatch: { radius: 38, inner: '#2c2c2b', outer: '#171716' },
    iconSize: 50,
  },
  talk: {
    key: { x: 300, y: 1150, w: 300, h: 350, r: 40 },
    pressedImage: '/skins/nexus/talk-pressed.jpg',
    pressedRect: { x: 270, y: 1125, w: 350, h: 400 },
    label: { x: 444, y: 1330, size: 25 },
  },
  replay: {
    area: { x: 652, y: 1208, w: 163, h: 210 },
    clip: 'polygon(22% 0, 78% 0, 100% 16%, 100% 84%, 78% 100%, 22% 100%, 0 84%, 0 16%)',
  },

  labels: {
    brand: { x: 222, y: 136, size: 30 },
    brandSub: { x: 222, y: 166, size: 14 },
    rxtx: { x: 612, y: 144, size: 21 },
    pause: { x: 162, y: 1402, size: 22 },
    replay: { x: 733, y: 1450, size: 22 },
  },
}
