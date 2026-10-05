/** Whether this browser has been through the field training. */

const STORAGE_KEY = 'radio.training.v1'

/** True once the player has finished or skipped the training. */
export function trainingSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'done'
  } catch {
    return true
  }
}

export function markTrainingSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, 'done')
  } catch {
    /* storage unavailable */
  }
}
