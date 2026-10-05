import type { ChannelsLabels } from '../components/screen/ChannelsPanel'
import type { SettingsLabels, TranscriptLabels } from '../components/screen/Panels'
import type { LiveMode } from '../components/screen/StatusBar'
import type { FieldTrainingLabels } from '../components/training/FieldTraining'
import type { ConversationNotices } from '../engine/conversation'
import type { LogConfig } from '../types'

/** Stops on the field training tour, in order. */
export type TourStop = 'welcome' | 'subtitles' | 'talk' | 'pause' | 'replay' | 'log' | 'channels' | 'ready'

/** Words the tour fills in: language names in the player's language. */
export interface TourWords {
  target: string
  native: string
  /** hold: push-to-talk · toggle: tap and type. */
  talk: 'hold' | 'toggle'
}

/** Labels the log uses when the channel sets none of its own. */
export type LogLabels = Required<
  Pick<LogConfig, 'nowTab' | 'timelineTab' | 'objectiveTitle' | 'emptySection' | 'emptyTimeline' | 'newLabel' | 'updatedNotice' | 'translationLabel' | 'closeLabel'>
>

/** Every word the radio shows that is not part of a channel's own content, in one language. */
export interface UiText {
  /** The player's name on the channel. */
  you: string
  /** Status bar tag for a made channel, e.g. "Incident 07". */
  incident: (number: string) => string
  standby: string
  resume: string
  startFresh: string
  joinChannel: string
  rejoinChannel: string
  channels: string
  transcript: string
  settings: string
  channelClosed: string
  tuningIn: string
  /** Eyebrow on the resume screen. */
  logged: (transmissions: number) => string
  transmitting: (name: string) => string
  awaitingReply: (name: string) => string
  talk: { hold: string; tap: string; transmitting: string; cancel: string }
  pause: string
  /** Short label on the pause key while the channel waits. */
  play: string
  repeat: string
  live: Record<LiveMode, string>
  notices: ConversationNotices
  /** Which voice is in use, under the Voice setting. */
  engine: { elevenlabs: string; device: string; missing: string }
  feedNote: { offline: string; onRejoin: string; drillOnly: (language: string) => string }
  /** Note under Channel language when only the live feed can switch it. */
  liveOnly: string
  word: { loading: string; close: string }
  tx: { listening: string; sending: string; placeholder: string; send: string }
  translationHint: string
  log: LogLabels
  transcriptPanel: TranscriptLabels
  settingsPanel: SettingsLabels
  channelsPanel: ChannelsLabels
  training: FieldTrainingLabels
  tour: (w: TourWords) => Record<TourStop, { title: string; body: string }>
}

export const en: UiText = {
  you: 'You',
  incident: (n) => `Incident ${n}`,
  standby: 'Standby',
  resume: 'Resume',
  startFresh: 'Start fresh',
  joinChannel: 'Join channel',
  rejoinChannel: 'Rejoin channel',
  channels: 'Channels',
  transcript: 'Transcript',
  settings: 'Settings',
  channelClosed: 'Channel closed',
  tuningIn: 'Tuning in…',
  logged: (n) => `${n} transmission${n === 1 ? '' : 's'} logged`,
  transmitting: (name) => `${name} · Transmitting`,
  awaitingReply: (name) => `${name} · Awaiting reply`,
  talk: { hold: 'Hold to talk', tap: 'Tap to talk', transmitting: 'Transmitting', cancel: 'Cancel' },
  pause: 'Pause',
  play: 'Resume',
  repeat: 'Repeat',
  live: { live: 'Live', loading: '', paused: 'Paused', tx: 'TX', standby: 'Standby', off: 'Off air' },
  notices: {
    garbled: 'Transmission garbled',
    nothingReceived: 'No transmission received',
    channelError: 'Channel error',
    offAir: 'Channel off the air',
    signalLost: 'Signal lost. Retrying…',
    backupVoice: 'Voice service unavailable. Using backup voice.',
  },
  engine: { elevenlabs: 'ElevenLabs active', device: 'Device voice', missing: 'ElevenLabs not set up' },
  feedNote: { offline: 'Live feed offline', onRejoin: 'Applies when you rejoin', drillOnly: (lang) => `Drill recording is in ${lang} only` },
  liveOnly: 'Needs the live feed',
  word: { loading: 'Looking up…', close: 'Continue' },
  tx: { listening: 'Listening…', sending: 'Sending…', placeholder: 'Type your message…', send: 'Send' },
  translationHint: 'Tap to translate',
  log: {
    nowTab: 'Now',
    timelineTab: 'Timeline',
    objectiveTitle: 'Objective',
    emptySection: 'Nothing yet',
    emptyTimeline: 'No events logged yet.',
    newLabel: 'New',
    updatedNotice: 'Log updated',
    translationLabel: 'Translation',
    closeLabel: 'Close',
  },
  transcriptPanel: {
    title: 'Transcript',
    translation: 'Translation',
    cutOff: 'cut off',
    empty: 'Nothing on this channel yet.',
    close: 'Close',
  },
  settingsPanel: {
    title: 'Settings',
    feed: 'Feed',
    live: 'Live',
    drill: 'Drill',
    translation: 'Translation',
    highlight: 'Word highlight',
    speed: 'Speed',
    static: 'Static',
    staticLevels: { off: 'Off', low: 'Low', mid: 'Mid', high: 'High' },
    volume: 'Volume',
    voice: 'Voice',
    voices: { auto: 'Auto', elevenlabs: 'Eleven', device: 'Device' },
    talkInput: 'Talk input',
    inputs: { voice: 'Voice', keyboard: 'Keyboard' },
    micLanguage: 'Mic language',
    on: 'On',
    off: 'Off',
    yourLanguage: 'Your language',
    channelLanguage: 'Channel language',
    training: 'Field training',
    trainingAction: 'Start',
    restart: 'Rejoin channel',
    close: 'Close',
  },
  channelsPanel: {
    title: 'Channels',
    newChannel: 'New channel',
    newTitle: 'New channel',
    preset: 'Preset',
    onAir: 'On air',
    tunedIn: 'Tuned in',
    notStarted: 'Not started',
    transmissions: (n) => `${n} transmission${n === 1 ? '' : 's'}`,
    closed: 'Closed',
    outcome: { success: '✓', failure: '✕', other: '·' },
    delete: 'Delete',
    confirmDelete: (label) => `Delete ${label}?`,
    clear: 'Clear log',
    confirmClear: (label) => `Clear ${label}?`,
    cancel: 'Cancel',
    steps: ['Situation', 'Your part', 'Signal', 'Confirm'],
    briefingPrompt: 'What’s going on?',
    placeholder: 'Or describe it: a lighthouse keeper loses power in a storm…',
    situations: [
      { label: 'Mountain rescue', about: 'Two climbers are stuck on a ridge as the weather turns.' },
      { label: 'Air traffic', about: 'A small plane loses its instruments and needs to be talked down.' },
      { label: 'Ferry in fog', about: 'A ferry crossing goes blind in thick fog near the rocks.' },
      { label: 'Wildfire watch', about: 'A wildfire jumps the line and a lookout tower has to be cleared.' },
      { label: 'Deep sea', about: 'A research submarine goes quiet on the sea floor.' },
    ],
    surprise: 'Surprise me',
    surpriseNote: 'The channel picks a situation for you.',
    partPrompt: 'Who are you on the channel?',
    partPlaceholder: 'Or in your own words…',
    parts: [
      { label: 'A local who knows the area', role: 'A local who knows the area well.' },
      { label: 'A trainee at the base', role: 'A trainee at the base, listening in and learning.' },
      { label: 'An expert they called in', role: 'An expert the team called in for advice.' },
      { label: 'Let them decide', role: '' },
    ],
    language: 'Language',
    level: 'Level',
    levelNotes: { A1: 'First words', A2: 'Everyday', B1: 'Getting by', B2: 'Confident' },
    tension: 'Tension',
    tensions: { calm: 'Calm', steady: 'Steady', intense: 'Intense' },
    confirmPrompt: 'Ready to open the channel?',
    summary: { situation: 'Situation', part: 'Your part', signal: 'Signal' },
    edit: 'Edit',
    next: 'Next',
    tuneIn: 'Tune in',
    back: 'Back',
    stages: ['Finding a free frequency…', 'Casting the voices…', 'Writing the briefing…', 'Opening the channel…'],
    searching: 'Searching for a signal…',
    offline: 'Live feed offline',
    tooMany: 'Too many new channels. Wait a minute and try again.',
    declined: 'No signal for that briefing. Try describing it another way.',
    noSignal: 'No signal. Try again.',
  },
  training: { eyebrow: 'Field training', next: 'Next', back: 'Back', skip: 'Skip', done: 'Done', key: 'Key' },
  tour: ({ target, native, talk }) => ({
    welcome: {
      title: 'Welcome to the channel',
      body: `This radio picks up a live channel. Two teams talk in ${target} as things happen. Listen in, and break in whenever you like.`,
    },
    subtitles: {
      title: 'Follow every word',
      body: `Each transmission appears here word by word, with the ${native} translation underneath. Tap any word to see what it means.`,
    },
    talk: {
      title: 'Break in',
      body:
        talk === 'toggle'
          ? `Tap this key and type your message. Write in ${target}, ${native} or a mix; the teams answer in ${target}.`
          : `Hold this key and speak, then let go to send. Use ${target}, ${native} or a mix; the teams answer in ${target}.`,
    },
    pause: { title: 'Pause', body: 'Stop the channel to catch your breath or reread a line. Press again to carry on.' },
    replay: { title: 'Repeat', body: 'Missed something? Tap the speaker grille to hear the last transmission again.' },
    log: { title: 'Field log', body: 'People, places and events are tracked here as things change. A dot on the key means something new.' },
    channels: { title: 'Channels', body: 'Tap the channel name to switch channels, or set up your own from a short briefing.' },
    ready: { title: 'Ready?', body: 'Join the channel when you are ready. You can run this training again from Settings.' },
  }),
}
