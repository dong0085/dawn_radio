/** A rectangle in skin image pixels. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
  /** Corner radius in image pixels. */
  r?: number
}

export interface Point {
  x: number
  y: number
}

export interface SkinLabel extends Point {
  /** Font size in image pixels. */
  size: number
}

/**
 * A photo-based device skin. All coordinates are pixels in the base image,
 * so a new skin is just new images plus new numbers.
 */
export interface PhotoSkin {
  /** Base image size. The device is drawn at this size, then scaled to fit. */
  width: number
  height: number
  /** Device with a black screen and all lights off. */
  base: string
  /** Page color around the device; should match the image edges. */
  backdrop: string
  /** How far the image edges fade into the backdrop (0–0.5 of each side). */
  edgeFade?: number
  /** CSS filter applied to every piece of the photo, e.g. to brighten it. */
  tone?: string

  /** Where the live screen goes. */
  screen: Rect
  /** Logical width the screen UI is laid out at (it is scaled to fill screen.w). */
  screenLayoutWidth: number

  led: Rect
  sideLights: { left: Rect; right: Rect }
  talkLights: { top: Rect; bottom: Rect }

  pause: {
    center: Point
    /** Radius of the pressable cap. */
    radius: number
    /** Patch that hides the printed pause bars when the play icon shows. */
    iconPatch: { radius: number; inner: string; outer: string }
    iconSize: number
  }
  talk: {
    /** Pressable key face. */
    key: Rect
    /** Image of the key pressed in, and where it sits on the base image. */
    pressedImage?: string
    pressedRect?: Rect
    label: SkinLabel
  }
  replay: { area: Rect; clip?: string }

  labels: {
    brand?: SkinLabel
    brandSub?: SkinLabel
    rxtx?: SkinLabel
    pause?: SkinLabel
    replay?: SkinLabel
  }
}
