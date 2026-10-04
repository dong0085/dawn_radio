# Dawn Radio

A live radio drama for language learners. Two AI parties talk over a walkie-talkie channel, and the player listens, pauses, or holds push-to-talk to join in. Every line shows bilingual subtitles with word-by-word highlighting.

- **Live feed:** Claude writes the dialogue as you listen, a few lines at a time, and reacts to what you say on the radio.
- **Voices:** ElevenLabs, with word timings for the highlight.
- **Your voice:** ElevenLabs Scribe turns push-to-talk audio into text (any language, or a mix).
- **Drill feed:** a fixed French/English cave rescue, used when no Claude key is set (or chosen in Settings → Feed).

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

Copy `.env.example` to `.env.local` and add your keys:

| Variable | What it turns on |
| --- | --- |
| `ANTHROPIC_API_KEY` | Live feed (Claude writes the dialogue) |
| `ELEVENLABS_API_KEY` | ElevenLabs voices and speech-to-text |
| `APP_ACCESS_CODE` | Optional. Players must enter this code in Settings before the API answers. Use it on a public URL. |

Optional: `CLAUDE_MODEL` (default `claude-opus-5-5`), `CLAUDE_EFFORT` (default `low`, the fastest), `ELEVENLABS_MODEL_ID` (default `eleven_multilingual_v2`), `ELEVENLABS_STT_MODEL` (default `scribe_v1`).

With no keys, the app still runs: drill feed, the browser's built-in voice, and the browser's speech recognition. `/api/config` shows what is set up.

`npm run preview:cf` runs the built app on Cloudflare's local runtime, the same as production.

## Controls

| Action | Touch / mouse | Keyboard |
| --- | --- | --- |
| Talk | Hold the big key | Hold Space |
| Pause / resume | Round key | P |
| Repeat line | Speaker grille | R |
| Field log | Screen icon | L |
| Transcript | Screen icon | T |
| Close / cancel | ✕ | Esc |

Talk input records your voice and sends it to ElevenLabs Scribe. Without an ElevenLabs key, it falls back to the browser's speech recognition (Chrome, Edge, Safari). With Settings → Talk input → Keyboard, the key opens a text field instead.

## Deploy (Cloudflare Pages, free)

```bash
npx wrangler login                                        # once, opens the browser
npx wrangler pages project create dawn-radio --production-branch main   # once
npm run deploy
```

Then add the keys as secrets (each command asks for the value):

```bash
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name dawn-radio
npx wrangler pages secret put ELEVENLABS_API_KEY --project-name dawn-radio
npx wrangler pages secret put APP_ACCESS_CODE --project-name dawn-radio   # recommended
```

Run `npm run deploy` again after adding secrets so the new values take effect.

## How it fits together

```
src/
  scenarios/          scenario data (parties, colors, voices, script)
  engine/
    conversation.ts   controller: batches, prefetch, pause, replay, push-to-talk
    sources/          where lines come from: ai.ts (Claude), scripted.ts (drill), auto.ts (picks one)
    speech/           voices: ElevenLabs (with timings) and browser fallback
    radioAudio.ts     radio sound: band-pass, distortion, hiss, squelch, beeps
    words.ts          word timings, ElevenLabs alignment, subtitle paging
    transcriber.ts    speech-to-text for the player (Scribe, or the browser recognizer)
  components/
    device/           PhotoDevice (image skin) and RadioDevice (pure CSS)
    screen/           status bar, subtitles, waveform, transcript, settings
    controls/         pause, push-to-talk, repeat grille
  skins/              photo skin configs (pixel positions on the images)
  theme.ts            colors, fonts, brand text
  api.ts              browser client for /api
shared/
  stories.ts          story bibles the AI writes from (premise, characters, events, endings)
  api.ts              request/response shapes and limits
server/               /api routes, shared by the dev server and Cloudflare
  router.ts           /api/config, access code check, routing
  dialogue.ts         Claude: next lines, translations, log updates, story memory
  tts.ts, stt.ts      ElevenLabs voices and Scribe
functions/api/[[route]].ts   Cloudflare Pages Function entry
```

### Customizing

- **New scenario:** copy `src/scenarios/caveRescue.ts` and pass it to `<App data={...} />`. Party names, sides, colors and voices all come from the scenario.
- **Field log:** `scenario.log` sets the panel title, sections and starting entries. Each line can carry a `log` update (objective, entries, timeline event), applied when that line starts playing. Leave `log` out to hide the panel.
- **Photo skin (default):** the device is drawn from rendered images in `public/skins/nexus/`. `src/skins/nexus.ts` holds the pixel positions of the screen, lights, keys and labels. For a new skin, add images and a new config with the same shape (`PhotoSkin`), then pass it as `<App skin={...} />`.
- **CSS device:** `<App skin={null} />` draws the device entirely in CSS. Colors and fonts come from `theme` (`RadioTheme`).
- **Live feed for a new scenario:** add a bible to `shared/stories.ts` with the same id as the scenario. The server only accepts known story ids, so players can't send their own prompts.
- **Other line sources:** implement `LineSource` (`engine/sources/types.ts`) and return it from `createSource` in `App.tsx`.
