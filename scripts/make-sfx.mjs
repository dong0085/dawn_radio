// Generates the radio ambience files with the ElevenLabs Sound Effects API.
// Run once: node --env-file=.env scripts/make-sfx.mjs   (needs ELEVENLABS_API_KEY)
import { writeFile } from 'node:fs/promises'

const sounds = [
  {
    file: 'cave.mp3',
    prompt: 'Inside a wet limestone cave: slow water drips echoing, a distant trickle of water, hollow quiet air. No music, no voices.',
    duration: 20,
    loop: true,
  },
  {
    file: 'control-room.mp3',
    prompt: 'Quiet emergency operations room: low electrical hum, soft air conditioning, very faint distant keyboard typing. No music, no voices.',
    duration: 20,
    loop: true,
  },
  {
    file: 'rain.mp3',
    prompt: 'Steady heavy rain on a tent roof outdoors at night, gusts of wind. No thunder, no music.',
    duration: 20,
    loop: true,
  },
  {
    file: 'crackle.mp3',
    prompt: 'Short burst of analog walkie-talkie static and crackling interference, signal breaking up.',
    duration: 2,
    loop: false,
  },
]

const key = process.env.ELEVENLABS_API_KEY
if (!key) throw new Error('ELEVENLABS_API_KEY is not set')

for (const s of sounds) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text: s.prompt, duration_seconds: s.duration, loop: s.loop, prompt_influence: 0.5 }),
  })
  if (!res.ok) {
    console.error(s.file, res.status, (await res.text()).slice(0, 300))
    continue
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  await writeFile(new URL(`../public/sfx/${s.file}`, import.meta.url), bytes)
  console.log(s.file, `${(bytes.length / 1024).toFixed(0)} KB`)
}
