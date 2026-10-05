const KEY = 'radio.player.v1'
let fallback: string | null = null

/**
 * This browser's anonymous player id, made on first use. The server files channels and
 * sessions under it. With storage blocked, it lasts until the page closes.
 */
export function playerId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return (fallback ??= crypto.randomUUID())
  }
}
