/**
 * Story bibles: what the AI writers know about each scenario.
 * Shared by the browser and the server. The server only accepts story ids,
 * so the prompt can't be swapped out by a client.
 */

export type Outcome = 'success' | 'failure' | 'other'

export interface StoryParty {
  id: string
  name: string
  /** Who they are and where they are. */
  role: string
  /** How they talk. */
  voice: string
}

export interface StoryBible {
  id: string
  title: string
  /** BCP-47 tags. */
  targetLang: string
  nativeLang: string
  /** CEFR level for the dialogue, e.g. "A2", "B1". */
  level: string
  premise: string
  setting: string
  parties: [StoryParty, StoryParty]
  /** Who the player is inside the story. */
  playerRole: string
  /** Events the writers can draw on (not a fixed order). */
  beats: string[]
  endings: { outcome: Outcome; when: string }[]
  /** Field log sections the writers file entries under (ids match the app's log config). */
  logSections: { id: string; holds: string }[]
  /** Rough story length in batches of lines. */
  targetBatches: number
  /** No ending before this batch. */
  minBatches: number
}

export const caveRescueBible: StoryBible = {
  id: 'cave-rescue',
  title: 'Cave Rescue',
  targetLang: 'fr-FR',
  nativeLang: 'en-US',
  level: 'A2–B1',
  premise:
    'A caver named Julien has been missing for six hours in the Grotte des Fées, a limestone cave system in the Vercors mountains. A two-person rescue team searches inside while Mission Control guides them from the surface. Heavy rain is coming, and the lower galleries flood when it rains.',
  setting:
    'Narrow passages, a second gallery, an underground lake, an unstable side passage, a low crawlway. Radio contact gets worse deeper in the cave. Surface: rain, a medical team waiting at the entrance, a weather radar.',
  parties: [
    {
      id: 'rescue',
      name: 'Rescue Team',
      role: 'Léa, team leader, inside the cave with her partner Karim. Experienced, practical, sometimes out of breath.',
      voice: 'Short, physical sentences. Describes what she sees, hears and feels. Calm under pressure, honest when scared.',
    },
    {
      id: 'control',
      name: 'Mission Control',
      role: 'Marc, the coordinator at the surface. Has the cave map, the weather radar and contact with the medics.',
      voice: 'Clear, structured, reassuring. Gives instructions, asks precise questions, tracks time.',
    },
  ],
  playerRole:
    'an observer on the same channel (call sign "Observer"), a volunteer at the surface who knows this cave well and can see the weather radar. Both parties can hear the player and treat them as a helpful outsider.',
  beats: [
    'The team reaches the second gallery; the air is cold and wet.',
    'They find signs of Julien: footprints, an abandoned rope, a dropped glove.',
    'An unstable side passage looks like a shortcut but is risky.',
    'Control reports the rain is starting and the water will rise.',
    'Radio contact cuts out for a moment deep in the cave.',
    'They hear a voice, find Julien conscious but injured (ankle).',
    'They must choose a route back as the water rises.',
    'A lamp fails or a rope is too short; they improvise.',
  ],
  endings: [
    { outcome: 'success', when: 'Everyone gets out before the galleries flood.' },
    { outcome: 'failure', when: 'The water cuts off the way out; the team must shelter and wait, the rescue fails for now.' },
    { outcome: 'other', when: 'Julien is found but the team must wait for a second team; a tense, open ending.' },
  ],
  logSections: [
    { id: 'who', holds: 'people and teams, with where they are or how they are' },
    { id: 'route', holds: 'places the team has reached, in order (entrance first)' },
    { id: 'found', holds: 'clues and items found' },
    { id: 'hazards', holds: 'dangers: weather, water, unstable rock, equipment problems' },
  ],
  targetBatches: 9,
  minBatches: 5,
}

export const stories: Record<string, StoryBible> = {
  [caveRescueBible.id]: caveRescueBible,
}
