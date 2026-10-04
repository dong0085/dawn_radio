# Dawn Radio

A live radio drama for language learners. Two AI parties talk over a walkie-talkie channel, and the player listens, pauses, or holds push-to-talk to join in. Every line shows bilingual subtitles with word-by-word highlighting.

- **Live feed:** Claude writes the dialogue as you listen, 4 lines at a time, streamed line by line. It reacts to what you say, quietly repeats your message back in correct French, keeps the field log up to date, and steers toward an ending.
- **Voices:** ElevenLabs, streamed, with word timings for the highlight. Only the next line is prepared ahead, so cutting in wastes at most one line. Delivery cues like `[urgent]` shape the performance.
- **Your voice:** ElevenLabs Scribe turns push-to-talk audio into text (any language, or a mix). DeepL then shows your message in both languages.
- **Tap a word** in the subtitle to pause and see what it means there (DeepL, using the sentence as context).
- **Each side sounds different:** cave drips and a weaker signal for the team inside, room hum for control. Weak signals hiss and briefly drop out.
- **Saved as you go:** reload or come back later and the channel waits on standby with a Resume button.
- **Drill feed:** a fixed French/English cave rescue, used when no Claude key is set (or chosen in Settings → Feed).

## Run locally

```bash
pnpm install
pnpm dev             # http://localhost:5173
```

Copy `.env.example` to `.env.local` and add your keys:

| Variable | What it turns on |
| --- | --- |
| `ANTHROPIC_API_KEY` | Live feed (Claude writes the dialogue) |
| `ELEVENLABS_API_KEY` | ElevenLabs voices and speech-to-text |
| `DEEPL_API_KEY` | Word lookups and translating your messages. Free keys (ending `:fx`) work. |

Optional:

| Variable | Default | Notes |
| --- | --- | --- |
| `CLAUDE_MODEL` | `claude-opus-5-5` | `claude-sonnet-5-5` replies faster (see below) |
| `CLAUDE_EFFORT` | `low` | Lower is faster |
| `CLAUDE_THINKING` | on | `off` turns thinking off on Claude Sonnet 5.5, for the fastest first line |
| `ELEVENLABS_MODEL_ID` | `eleven_v4` | `eleven_v4_turbo` is faster; `eleven_multilingual_v2` ignores delivery cues |
| `ELEVENLABS_STT_MODEL` | `scribe_v1` | |

**Reply speed.** The wait after you speak is mostly Claude writing its first line. Measured on the same request: Claude Opus 5.5 takes about 4–12 s to its first line (its thinking can't be turned off); Claude Sonnet 5.5 with `CLAUDE_THINKING=off` takes about 6 s. Voice adds about 0.7 s.

**Ambience files.** The cave, room and rain sounds are generated in the browser. To use recorded ones instead, run `node --env-file=.env scripts/make-sfx.mjs` once (needs the *sound generation* permission on the ElevenLabs key); it writes `public/sfx/*.mp3`, which the app picks up automatically.

**Spending.** Each visitor is limited per minute on every API route (`server/rateLimit.ts`). For a public URL, also set a monthly spend limit in the Anthropic, ElevenLabs and DeepL dashboards; those are the only hard caps.

With no keys, the app still runs: drill feed, the browser's built-in voice, and the browser's speech recognition. `/api/config` shows what is set up.

`pnpm preview:cf` runs the built app on Cloudflare's local runtime, the same as production.

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

Every push to `main` deploys to production. Other branches and pull requests get their own preview URL.

One-time setup in the Cloudflare dashboard: **Workers & Pages → Create → Pages → Import an existing Git repository**, pick this repo, then:

| Setting | Value |
| --- | --- |
| Project name | `dawn-radio` (matches `wrangler.toml`) |
| Production branch | `main` |
| Framework preset | None |
| Build command | `pnpm build` |
| Build output directory | `dist` |

Add the keys as encrypted environment variables, in the setup screen or later in the project settings: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` and `DEEPL_API_KEY`. You can also set them from the terminal:

```bash
pnpm exec wrangler login                                                  # once, opens the browser
pnpm exec wrangler pages secret put ANTHROPIC_API_KEY --project-name dawn-radio
```

New secret values take effect on the next deploy (a push, or **Retry deployment** in the dashboard).

`pnpm run deploy` uploads a build straight from your machine, for when you want to skip Git.

## How it fits together

```
src/
  scenarios/          scenario data (parties, colors, voices, script)
  engine/
    conversation.ts   controller: streamed batches, one-line-ahead voices, pause, replay, push-to-talk
    sources/          where lines come from: ai.ts (Claude), scripted.ts (drill), auto.ts (picks one)
    speech/           voices: ElevenLabs (stream.ts plays audio as it arrives) and browser fallback
    radioAudio.ts     radio sound: band-pass, distortion, hiss, squelch, beeps, signal dropouts
    ambience.ts       background sound at each end (generated, or recorded files)
    session.ts        keeps the transcript, log and story memory across reloads
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
  router.ts           /api/config, rate limits, routing
  dialogue.ts         Claude: next lines, translations, log updates, story memory
  tts.ts, stt.ts      ElevenLabs voices (whole or streamed) and Scribe
  translate.ts        DeepL
  rateLimit.ts        per-visitor limits
functions/api/[[route]].ts   Cloudflare Pages Function entry
scripts/make-sfx.mjs  one-off: recorded ambience with the ElevenLabs Sound Effects API
```

### Customizing

- **New scenario:** copy `src/scenarios/caveRescue.ts` and pass it to `<App data={...} />`. Party names, sides, colors and voices all come from the scenario.
- **Field log:** `scenario.log` sets the panel title, sections and starting entries. Each line can carry a `log` update (objective, entries, timeline event), applied when that line starts playing. Leave `log` out to hide the panel.
- **Photo skin (default):** the device is drawn from rendered images in `public/skins/nexus/`. `src/skins/nexus.ts` holds the pixel positions of the screen, lights, keys and labels. For a new skin, add images and a new config with the same shape (`PhotoSkin`), then pass it as `<App skin={...} />`.
- **CSS device:** `<App skin={null} />` draws the device entirely in CSS. Colors and fonts come from `theme` (`RadioTheme`).
- **Live feed for a new scenario:** add a bible to `shared/stories.ts` with the same id as the scenario. The server only accepts known story ids, so players can't send their own prompts.
- **Other line sources:** implement `LineSource` (`engine/sources/types.ts`) and return it from `createSource` in `App.tsx`.
