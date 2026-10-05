import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence } from 'motion/react'
import { RadioDevice } from './components/device/RadioDevice'
import { PhotoDevice } from './components/device/PhotoDevice'
import type { LedState } from './components/device/parts'
import type { DeviceControls, DeviceViewProps } from './components/device/types'
import { GearIcon, LogIcon, TranscriptIcon } from './components/icons'
import { ChannelsPanel, NewChannelPanel } from './components/screen/ChannelsPanel'
import { DockedLog, LogPanel, type LogTab } from './components/screen/LogPanel'
import { DockedTranscript, SettingsPanel, TranscriptPanel } from './components/screen/Panels'
import { LiveIndicator, PartyBar, StatusBar, type LiveMode } from './components/screen/StatusBar'
import { Subtitle } from './components/screen/Subtitle'
import { MessageView, TransmitView, WordCard } from './components/screen/Views'
import { Waveform } from './components/screen/Waveform'
import { FieldTraining, type TrainingStep } from './components/training/FieldTraining'
import { markTrainingSeen, trainingSeen } from './components/training/seen'
import './components/screen/screen.css'
import { ScriptedSource } from './engine/sources/scripted'
import { AiSource } from './engine/sources/ai'
import { AutoSource } from './engine/sources/auto'
import { getConfig, translate } from './api'
import { stories } from '../shared/stories.ts'
import { CHANNEL_LANGUAGES, NATIVE_LANGUAGES } from '../shared/channels.ts'
import { formatElapsed, languageLabel, ownLanguageLabel } from './components/screen/format'
import { RecordingsPanel } from './components/screen/RecordingsPanel'
import { deleteRecording, listRecordings, saveRecording } from './recordings'
import type { SavedSession } from './engine/session'
import type { LineSource } from './engine/sources/types'
import { uiText, type UiText } from './i18n'
import type { TourStop } from './i18n/text'
import { useConversation } from './engine/useConversation'
import { useClock } from './hooks/useClock'
import { useFitScale } from './hooks/useFitScale'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useShortcuts } from './hooks/useShortcuts'
import { useStoredState } from './hooks/useStoredState'
import { caveRescue } from './scenarios/caveRescue'
import { useSettings } from './settings'
import { defaultTheme, themeVars, type RadioTheme } from './theme'
import { PLAYER_ID, type Party, type TimedWord } from './types'
import type { ScriptedScenario } from './engine/sources/scripted'
import { nexusSkin } from './skins/nexus'
import './layout.css'
import type { PhotoSkin } from './skins/types'
import type { ChannelData } from './channels/build'
import type { ChannelsController } from './channels/useChannels'

export interface AppProps {
  /** The preset (with its recorded script) or a channel made from a briefing. */
  data?: ScriptedScenario | ChannelData
  /** Channel list controls; without it the radio stays on one channel. */
  channels?: ChannelsController
  theme?: RadioTheme
  /** Photo skin for the device; null draws the device in CSS instead. */
  skin?: PhotoSkin | null
  /** Language of the preset's recording (drill feed). Heard in any other language, the channel is always live. */
  recordedIn?: string
  /** The radio's own wording; defaults to the player's language. */
  text?: UiText
  /** Plays a saved recording like a tape instead of the live channel. */
  tape?: Tape
  /** Opens a saved recording (the recordings list is hidden without it). */
  onPlayRecording?: (id: string) => void
  /** Leaves a recording for the live channel. */
  onBackToLive?: () => void
}

/** A saved recording to play back. */
export interface Tape {
  id: string
  title: string
  savedAt: number
  session: SavedSession
}

type Overlay = 'log' | 'transcript' | 'settings' | 'channels' | 'new-channel' | 'recordings'

/** A tape writes no new lines. */
const silentSource: LineSource = { next: async () => ({ lines: [] }) }

export default function App({ data = caveRescue, theme = defaultTheme, skin = nexusSkin, channels, recordedIn, text, tape, onPlayRecording, onBackToLive }: AppProps) {
  const { scenario } = data
  const t = text ?? uiText(scenario.nativeLang)
  const targetName = languageLabel(scenario.targetLang, scenario.nativeLang)
  const nativeName = languageLabel(scenario.nativeLang, scenario.nativeLang)
  const [settings, update] = useSettings()
  const languages = { targetLang: scenario.targetLang, nativeLang: scenario.nativeLang }
  /** The recording only exists in its own language. */
  const drillHeard = !recordedIn || recordedIn === scenario.targetLang
  const { state, conversation, config } = useConversation({
    scenario,
    settings,
    notices: t.notices,
    tape: tape && { recording: tape.id, session: tape.session },
    // Live feed: Claude writes the lines (when the server has a key); drill: the fixed recording.
    createSource: (getSettings) =>
      tape
        ? silentSource
        : // A channel made from a briefing has no recording, so it is always live.
          'channel' in data
        ? new AiSource({ channel: data.channel, ...languages })
        : new AutoSource(async () => {
            const config = await getConfig()
            const live = (getSettings().feed === 'live' || !drillHeard) && config.dialogue && !!stories[scenario.id]
            return live ? new AiSource({ storyId: scenario.id, ...languages }) : new ScriptedSource(data)
          }),
  })
  const clock = useClock()
  const [overlay, setOverlayState] = useState<Overlay | null>(null)
  const [revealedLine, setRevealedLine] = useState<string | null>(null)
  const [logTab, setLogTab] = useState<LogTab>('now')
  /** Transcript line to scroll to, when opened from the log. */
  const [transcriptFocus, setTranscriptFocus] = useState<string | undefined>()
  const layoutRef = useRef<HTMLDivElement>(null)
  const [deviceRef, deviceScale] = useFitScale(skin?.width ?? 1, skin?.height ?? 1, 1)
  const [training, setTraining] = useState(false)
  /** The channel was playing when training opened, so it plays again after. */
  const resumeAfterTraining = useRef(false)
  const fineInput = useMediaQuery('(hover: hover) and (pointer: fine)')

  // With room beside the radio, the log sits there, always open, instead of inside the screen.
  // With more room, the transcript does too, on the other side.
  const { logSide, dockFrom, transcriptDockFrom } = theme.layout
  const docked = useMediaQuery(`(min-width: ${dockFrom}px)`) && !!scenario.log
  const transcriptDocked = useMediaQuery(`(min-width: ${transcriptDockFrom}px)`)
  const transcriptSide = logSide === 'right' ? 'left' : 'right'
  /** Which docked panels are unfolded. The transcript starts folded away. */
  const [unfolded, setUnfolded] = useStoredState('radio.dock.v1', { transcript: false, log: true })
  const toggleDock = (panel: keyof typeof unfolded) => setUnfolded({ ...unfolded, [panel]: !unfolded[panel] })

  const logVersion = state.log.version
  /** Log version the player has seen. Everything after it is new. */
  const [seenVersion, setSeenVersion] = useState(0)
  const logInView = docked ? unfolded.log : overlay === 'log'
  // An open docked log is always in view, so it is always seen.
  if (docked && unfolded.log && seenVersion !== logVersion) setSeenVersion(logVersion)
  const logUnseen = !logInView && logVersion > seenVersion

  const setOverlay = (next: Overlay | null) => {
    // Leaving the log marks everything in it as seen.
    if (overlay === 'log' && next !== 'log') setSeenVersion(logVersion)
    if (next !== 'transcript') setTranscriptFocus(undefined)
    setOverlayState(next)
  }
  const toggle = (o: Overlay) => {
    setTranscriptFocus(undefined)
    setOverlay(overlay === o ? null : o)
  }
  const restart = () => {
    setOverlay(null)
    setSeenVersion(0)
    conversation.restart()
  }

  // First visit: open the training once the radio is on screen. Returning listeners (with a saved session) skip it.
  const firstVisit = useRef(!trainingSeen() && state.phase === 'standby' && !state.resumed)
  useEffect(() => {
    if (!firstVisit.current) return
    const timer = setTimeout(() => setTraining(true), 700)
    return () => clearTimeout(timer)
  }, [])

  const openTraining = () => {
    setOverlay(null)
    setWordCard(null)
    resumeAfterTraining.current = state.phase === 'running' && !state.paused
    if (resumeAfterTraining.current) conversation.pause()
    setTraining(true)
  }
  const finishTraining = (completed: boolean) => {
    markTrainingSeen()
    firstVisit.current = false
    setTraining(false)
    if (resumeAfterTraining.current) conversation.resume()
    else if (completed && state.phase === 'standby') conversation.start()
    resumeAfterTraining.current = false
  }

  const [left, right] = (['left', 'right'] as const).map((side) => scenario.parties.find((p) => p.side === side)!) as [Party, Party]
  const { phase, activity, paused, current, onAir, txMode } = state

  const transmitting = activity === 'transmitting' || activity === 'transcribing'
  const talkMode = settings.inputMode === 'keyboard' || txMode === 'keyboard' ? 'toggle' : 'hold'
  const speakerColor =
    onAir === PLAYER_ID ? scenario.player.color : (scenario.parties.find((p) => p.id === (onAir ?? current?.line.speaker))?.color ?? left.color)

  /** Word the player tapped: looked up in context while the channel waits. */
  const [wordCard, setWordCard] = useState<{
    lineId: string
    index: number
    word: string
    translation?: string
    note?: string
    resumeAfter: boolean
  } | null>(null)

  const tapWord = (w: TimedWord, index: number) => {
    const line = state.current?.line
    if (!line) return
    const resumeAfter = state.phase === 'running' && !state.paused && !wordCard?.resumeAfter
    if (resumeAfter) conversation.pause()
    const word = w.text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || w.text
    const sentence = line.segments[w.segment]
    const keep = !!wordCard?.resumeAfter
    setWordCard({ lineId: line.id, index, word, resumeAfter: resumeAfter || keep })
    const update = (patch: { translation?: string; note?: string }) =>
      setWordCard((c) => (c && c.lineId === line.id && c.index === index ? { ...c, ...patch } : c))
    if (config?.translate) {
      translate([word], scenario.nativeLang, { source: scenario.targetLang, context: sentence.text })
        .then(([t]) => update({ translation: t }))
        .catch(() => update({ translation: '', note: sentence.translation }))
    } else {
      update({ translation: '', note: sentence.translation })
    }
  }

  const closeWord = () => {
    if (wordCard?.resumeAfter) conversation.resume()
    setWordCard(null)
  }

  const press = () => {
    setOverlay(null)
    setWordCard(null)
    conversation.startTransmit(settings.inputMode)
  }
  const release = useCallback(() => {
    if (state.txMode === 'keyboard') conversation.cancelTransmit()
    else void conversation.endTransmit()
  }, [conversation, state.txMode])

  useShortcuts({
    onTalkDown: press,
    onTalkUp: () => talkMode === 'hold' && void conversation.endTransmit(),
    onPause: () => conversation.togglePause(),
    onReplay: () => conversation.replay(),
    // Docked panels fold and unfold instead.
    onTranscript: () => (transcriptDocked ? toggleDock('transcript') : toggle('transcript')),
    onChannels: () => (tape ? toggle('recordings') : channels && toggle('channels')),
    onLog: () => (docked ? toggleDock('log') : scenario.log && toggle('log')),
    onEscape: () => (transmitting ? conversation.cancelTransmit() : wordCard ? closeWord() : setOverlay(null)),
  })

  const liveMode: LiveMode =
    phase === 'standby'
      ? 'standby'
      : transmitting
        ? 'tx'
        : paused
          ? 'paused'
          : state.replaying
            ? 'replay'
            : phase === 'ended'
              ? 'off'
              : activity === 'waiting'
                ? 'loading'
                : 'live'

  const led: LedState =
    phase !== 'running' ? 'idle' : transmitting ? 'tx' : activity === 'waiting' && !paused ? 'busy' : 'rx'

  const showTranslation = settings.showTranslation || revealedLine === current?.line.id

  // Saving the session as a recording, with its audio.
  const [save, setSave] = useState<{ status: 'idle' | 'saving' | 'saved' | 'failed'; lines: number }>({ status: 'idle', lines: 0 })
  const savedNow = save.status === 'saved' && save.lines === state.transcript.length
  const saveSession = async () => {
    const snap = conversation.snapshot()
    if (!snap) return
    setSave({ status: 'saving', lines: snap.transcript.length })
    try {
      await saveRecording(snap, scenario.title)
      setSave({ status: 'saved', lines: snap.transcript.length })
    } catch (err) {
      console.warn('[recording] not saved', err)
      setSave((s) => ({ ...s, status: 'failed' }))
    }
  }
  const saveKey = !tape && config?.db && state.transcript.length > 0 && (
    <button type="button" className={`chip${savedNow ? ' is-on' : ''}`} disabled={save.status === 'saving' || savedNow} onClick={saveSession}>
      {save.status === 'saving' ? t.recording.saving : savedNow ? t.recording.saved : save.status === 'failed' ? t.recording.failed : t.recording.save}
    </button>
  )
  /** The tape has been played at least once, so stopping shows its end. */
  const [tapePlayed, setTapePlayed] = useState(false)
  const playTape = () => {
    setTapePlayed(true)
    const first = state.transcript[0]
    if (first) conversation.replayFrom(first.id)
  }

  const content = (() => {
    if (transmitting) {
      return (
        <TransmitView
          key="tx"
          label={t.transmitting(scenario.player.name)}
          color={scenario.player.color}
          text={state.txText}
          mode={txMode ?? 'voice'}
          processing={activity === 'transcribing'}
          listeningText={t.tx.listening}
          processingText={t.tx.sending}
          placeholder={t.tx.placeholder}
          sendLabel={t.tx.send}
          onChange={(t) => conversation.setTxText(t)}
          onSubmit={() => void conversation.endTransmit()}
          onCancel={() => conversation.cancelTransmit()}
        />
      )
    }
    if (tape && !state.replaying && phase !== 'running') {
      const ended = tapePlayed && state.ending
      const eyebrow = t.recording.eyebrow(new Intl.DateTimeFormat(scenario.nativeLang, { dateStyle: 'medium' }).format(tape.savedAt))
      return (
        <MessageView
          key={tapePlayed ? 'tape-end' : 'tape'}
          eyebrow={eyebrow}
          title={tapePlayed ? (state.ending?.title ?? t.recording.end) : tape.title}
          tone={ended ? (state.ending!.outcome === 'success' ? 'var(--led-rx)' : state.ending!.outcome === 'failure' ? 'var(--led-tx)' : undefined) : undefined}
          body={tapePlayed ? state.ending?.summary : t.recordingsPanel.meta(state.transcript.length, formatElapsed(tape.session.elapsed))}
          actions={
            <>
              {onBackToLive && (
                <button type="button" className="chip" onClick={onBackToLive}>
                  {t.recording.backToLive}
                </button>
              )}
              <button type="button" className="chip chip--primary" onClick={playTape}>
                {tapePlayed ? t.recording.playAgain : t.recording.play}
              </button>
            </>
          }
        />
      )
    }
    if (phase === 'standby' && state.resumed) {
      const last = [...state.transcript].reverse().find((e) => e.speaker !== PLAYER_ID)
      return (
        <MessageView
          key="resume"
          eyebrow={`${scenario.channel} · ${t.logged(state.transcript.length)}`}
          title={t.standby}
          body={last ? `“${last.segments.map((x) => x.text).join(' ')}”` : scenario.premise}
          actions={
            <>
              <button type="button" className="chip" onClick={restart}>
                {t.startFresh}
              </button>
              {saveKey}
              <button type="button" className="chip chip--primary" onClick={() => conversation.start()}>
                {t.resume}
              </button>
            </>
          }
        />
      )
    }
    if (phase === 'standby') {
      return (
        <MessageView
          key="standby"
          eyebrow={`${scenario.channel} · ${scenario.frequency}`}
          title={t.standby}
          body={scenario.premise}
          actions={
            <>
              {channels && (
                <button type="button" className="chip" onClick={() => setOverlay('channels')}>
                  {t.channels}
                </button>
              )}
              <button type="button" className="chip chip--primary" data-tour="join" onClick={() => conversation.start()}>
                {t.joinChannel}
              </button>
            </>
          }
        />
      )
    }
    if (phase === 'ended' && state.ending && !current?.replay) {
      return (
        <MessageView
          key="ended"
          eyebrow={t.channelClosed}
          title={state.ending.title}
          tone={state.ending.outcome === 'success' ? 'var(--led-rx)' : state.ending.outcome === 'failure' ? 'var(--led-tx)' : undefined}
          body={state.ending.summary}
          actions={
            <>
              {!transcriptDocked && (
                <button type="button" className="chip" onClick={() => setOverlay('transcript')}>
                  {t.transcript}
                </button>
              )}
              {saveKey}
              <button type="button" className="chip chip--primary" onClick={restart}>
                {t.rejoinChannel}
              </button>
            </>
          }
        />
      )
    }
    const lastEntry = state.transcript[state.transcript.length - 1]
    if (activity === 'waiting' && lastEntry?.speaker === PLAYER_ID) {
      return (
        <TransmitView
          key="sent"
          label={t.awaitingReply(scenario.player.name)}
          color={scenario.player.color}
          text={lastEntry.segments[0]?.text ?? ''}
          mode="voice"
          processing
        />
      )
    }
    if (current) {
      return (
        <Subtitle
          key="sub"
          lineId={`${current.line.id}${current.replay ? ':r' : ''}`}
          segments={current.line.segments}
          words={current.words}
          wordIndex={current.wordIndex}
          showTranslation={showTranslation}
          highlight={settings.highlightWords}
          color={speakerColor}
          lang={scenario.targetLang}
          translationHint={t.translationHint}
          onRevealTranslation={() => setRevealedLine(current.line.id)}
          onWordTap={tapWord}
          selectedWord={wordCard?.lineId === current.line.id ? wordCard.index : undefined}
        />
      )
    }
    return <MessageView key="tuning" eyebrow={scenario.channel} title={t.tuningIn} />
  })()

  const engineStatus =
    state.engine === 'elevenlabs' ? t.engine.elevenlabs : settings.voiceEngine === 'browser' ? t.engine.device : t.engine.missing

  const controls: DeviceControls = {
    paused: paused || phase === 'standby',
    onPauseToggle: () => conversation.togglePause(),
    pauseLabel: t.pause,
    resumeLabel: t.play,
    talk: {
      pressed: transmitting,
      mode: talkMode,
      lightColor: theme.lights.talk,
      label: talkMode === 'toggle' ? t.talk.tap : t.talk.hold,
      activeLabel: talkMode === 'toggle' ? t.talk.cancel : t.talk.transmitting,
      disabled: phase === 'ended' || !!tape,
      onPress: press,
      onRelease: release,
    },
    replay: {
      onReplay: () => conversation.replay(),
      disabled: phase === 'standby' || transmitting,
      label: t.repeat,
    },
  }

  // The channel's own log wording first, then the radio's in the player's language.
  const logConfig = scenario.log && { ...t.log, ...scenario.log }
  // An open docked log shows its own changes, so the screen skips the "log updated" notice.
  const notice = docked && unfolded.log && state.notice === logConfig?.updatedNotice ? null : state.notice
  const toggleTranslation = () => update('showTranslation', !settings.showTranslation)
  const openLine = (lineId: string) => {
    setTranscriptFocus(lineId)
    if (!transcriptDocked) setOverlay('transcript')
    else if (!unfolded.transcript) setUnfolded({ ...unfolded, transcript: true })
  }
  /** Plays the channel again from a past line; the in-screen transcript closes so the line shows. */
  const playFrom = (lineId: string) => {
    setWordCard(null)
    if (!transcriptDocked) setOverlay(null)
    conversation.replayFrom(lineId)
  }
  const transcriptProps = {
    entries: state.transcript,
    parties: scenario.parties,
    player: scenario.player,
    showTranslation: settings.showTranslation,
    onToggleTranslation: toggleTranslation,
    liveId: onAir && onAir !== PLAYER_ID ? current?.line.id : undefined,
    focusId: transcriptFocus,
    targetLang: scenario.targetLang,
    onPlayFrom: playFrom,
    replaying: state.replaying,
    // On a tape, "back to live" leaves the recording.
    onGoLive: tape ? onBackToLive : () => conversation.goLive(),
    actions: saveKey,
    labels: t.transcriptPanel,
  }

  const screen = (
    <div className={`screen${phase !== 'standby' ? ' screen--booting' : ''}`} key={phase === 'standby' ? 'off' : 'on'}>
      <StatusBar
        onTitleClick={tape ? () => toggle('recordings') : channels ? () => toggle('channels') : undefined}
        titleLabel={t.channels}
        incident={scenario.incident}
        title={scenario.title}
        channel={scenario.channel}
        frequency={scenario.frequency}
        clock={clock}
        signal={phase === 'running' ? 4 : 2}
        actions={[
          ...(scenario.log && !docked
            ? [
                {
                  id: 'log',
                  label: scenario.log.title,
                  icon: <LogIcon size={18} />,
                  active: overlay === 'log',
                  badge: logUnseen,
                  onClick: () => toggle('log'),
                },
              ]
            : []),
          ...(!transcriptDocked
            ? [
                {
                  id: 'transcript',
                  label: t.transcript,
                  icon: <TranscriptIcon size={18} />,
                  active: overlay === 'transcript',
                  onClick: () => toggle('transcript'),
                },
              ]
            : []),
          {
            id: 'settings',
            label: t.settings,
            icon: <GearIcon size={18} />,
            active: overlay === 'settings',
            onClick: () => toggle('settings'),
          },
        ]}
      />

      <div className="main-panel panel">
        <PartyBar
          left={{ name: left.name, color: left.color, active: onAir === left.id }}
          right={{ name: right.name, color: right.color, active: onAir === right.id }}
          center={<LiveIndicator mode={liveMode} labels={t.live} />}
        />
        <div className="main-panel__content" data-tour="subtitles">
          <AnimatePresence mode="wait">{content}</AnimatePresence>
          {notice && !wordCard && <span className="notice">{notice}</span>}
          <AnimatePresence>
            {wordCard && wordCard.lineId === current?.line.id && !transmitting && (
              <WordCard
                key="word"
                word={wordCard.word}
                translation={wordCard.translation}
                note={wordCard.note}
                lang={scenario.targetLang}
                loadingText={t.word.loading}
                closeLabel={t.word.close}
                onClose={closeWord}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <Waveform
        getLevel={() => conversation.getLevel()}
        color={speakerColor}
        leftLabel={transmitting ? 'TX' : 'RX'}
        rightLabel={scenario.channel}
      />

      <AnimatePresence>
        {overlay === 'transcript' && !transcriptDocked && (
          <TranscriptPanel key="transcript" {...transcriptProps} onClose={() => setOverlay(null)} />
        )}
        {overlay === 'log' && logConfig && !docked && (
          <LogPanel
            key="log"
            config={logConfig}
            log={state.log}
            tab={logTab}
            onTabChange={setLogTab}
            seenVersion={seenVersion}
            showTranslation={settings.showTranslation}
            onToggleTranslation={toggleTranslation}
            onClose={() => setOverlay(null)}
            onOpenLine={openLine}
            lang={scenario.targetLang}
          />
        )}
        {overlay === 'channels' && channels && (
          <ChannelsPanel
            key="channels"
            items={channels.items()}
            currentId={channels.currentId}
            live={phase === 'running'}
            nativeLang={scenario.nativeLang}
            canCreate={!!config?.channels}
            onSelect={(id) => channels.select(id)}
            onNew={() => setOverlay('new-channel')}
            onDelete={(id) => channels.remove(id)}
            // The radio on this channel would save over a wipe, so it starts fresh instead.
            onClear={(id) => (id === channels.currentId ? restart() : channels.clear(id))}
            onClose={() => setOverlay(null)}
            onRecordings={config?.db && onPlayRecording ? () => setOverlay('recordings') : undefined}
            labels={t.channelsPanel}
          />
        )}
        {overlay === 'recordings' && onPlayRecording && (
          <RecordingsPanel
            key="recordings"
            load={listRecordings}
            onPlay={(id) => {
              setOverlay(null)
              onPlayRecording(id)
            }}
            onDelete={deleteRecording}
            onClose={() => setOverlay(null)}
            playingId={tape?.id}
            onBackToLive={onBackToLive}
            locale={scenario.nativeLang}
            labels={t.recordingsPanel}
          />
        )}
        {overlay === 'new-channel' && channels && (
          <NewChannelPanel
            key="new-channel"
            targetLang={scenario.targetLang}
            nativeLang={scenario.nativeLang}
            onCreate={(brief, signal) => channels.create(brief, signal)}
            onBack={() => setOverlay('channels')}
            onClose={() => setOverlay(null)}
            labels={t.channelsPanel}
          />
        )}
        {overlay === 'settings' && (
          <SettingsPanel
            key="settings"
            settings={settings}
            update={update}
            onClose={() => setOverlay(null)}
            onRestart={restart}
            engineStatus={engineStatus}
            feedNote={
              config && !config.dialogue
                ? t.feedNote.offline
                : !drillHeard && recordedIn
                  ? t.feedNote.drillOnly(languageLabel(recordedIn, scenario.nativeLang))
                  : t.feedNote.onRejoin
            }
            onTraining={openTraining}
            targetLabel={targetName}
            nativeLabel={nativeName}
            yourLanguage={{
              value: scenario.nativeLang,
              // Each language named in itself, so the player can find theirs whatever the radio shows now.
              options: NATIVE_LANGUAGES.filter((l) => l !== scenario.targetLang).map((l) => ({ value: l, label: ownLanguageLabel(l) })),
              onChange: (lang) => update('nativeLang', lang),
            }}
            channelLanguage={
              channels && {
                value: scenario.targetLang,
                options: CHANNEL_LANGUAGES.filter((l) => l.tag !== scenario.nativeLang).map((l) => ({
                  value: l.tag,
                  label: languageLabel(l.tag, scenario.nativeLang),
                })),
                onChange: (lang) => channels.setLanguage(channels.currentId, lang),
                // A preset without the live feed only has its recording, in one language.
                disabled: !!recordedIn && !('channel' in data) && !config?.dialogue,
                note: !!recordedIn && !('channel' in data) && config && !config.dialogue ? t.liveOnly : undefined,
              }
            }
            labels={t.settingsPanel}
          />
        )}
      </AnimatePresence>
    </div>
  )

  const vars = themeVars(theme, scenario)
  const device: DeviceViewProps = {
    style: vars,
    led,
    leftLight: { color: left.color, active: onAir === left.id && !paused },
    rightLight: { color: right.color, active: onAir === right.id && !paused },
    screen,
    controls,
  }

  const tour = t.tour({ target: targetName, native: nativeName, talk: talkMode })
  /** Where each stop points, and its keys. */
  const stops: (Omit<TrainingStep, 'title' | 'body'> & { stop: TourStop })[] = [
    { stop: 'welcome', target: null },
    { stop: 'subtitles', target: 'subtitles' },
    { stop: 'talk', target: 'talk', keys: [talkMode === 'toggle' ? 'Space' : 'Hold Space'] },
    { stop: 'pause', target: 'pause', keys: ['P'], shape: 'round' },
    { stop: 'replay', target: 'replay', keys: ['R'] },
    { stop: 'log', target: 'log', keys: ['L'] },
    { stop: 'channels', target: 'channels', keys: ['C'] },
    { stop: 'ready', target: 'join' },
  ]
  const trainingSteps: TrainingStep[] = stops.map(({ stop, ...step }) => ({
    ...step,
    ...tour[stop],
    // The log goes by the channel's own name for it.
    ...(stop === 'log' && scenario.log ? { title: scenario.log.title } : {}),
  }))

  return (
    <div
      ref={layoutRef}
      className={`layout${docked || transcriptDocked ? ' layout--docked' : ''}`}
      style={
        {
          ...vars,
          '--device-ratio': skin ? skin.width / skin.height : theme.designWidth / theme.designHeight,
          // Docked panels take the radio screen's corners.
          ...(skin && {
            '--dock-r': `${(skin.screen.r ?? 0) * deviceScale}px`,
            // Log text grows with the screen text, a little, so the narrow panel still fits it.
            '--dock-zoom': Math.min(1.2, Math.max(1, (skin.screen.w / skin.screenLayoutWidth) * deviceScale)),
          }),
          // Match the page to the photo backdrop so the radio's area blends in.
          background: skin?.backdrop,
        } as CSSProperties
      }
    >
      <div ref={deviceRef} className="layout__device">
        {skin ? <PhotoDevice skin={skin} theme={theme} scale={deviceScale} {...device} /> : <RadioDevice theme={theme} {...device} />}
      </div>
      {transcriptDocked && (
        <DockedTranscript side={transcriptSide} open={unfolded.transcript} onToggle={() => toggleDock('transcript')} {...transcriptProps} />
      )}
      {docked && logConfig && (
        <DockedLog
          side={logSide}
          open={unfolded.log}
          onToggle={() => toggleDock('log')}
          badge={logUnseen}
          config={logConfig}
          log={state.log}
          tab={logTab}
          onTabChange={setLogTab}
          showTranslation={settings.showTranslation}
          onToggleTranslation={toggleTranslation}
          onOpenLine={openLine}
          lang={scenario.targetLang}
        />
      )}
      {training && (
        <FieldTraining
          steps={trainingSteps}
          root={layoutRef}
          onFinish={finishTraining}
          finishLabel={phase === 'standby' && !state.resumed ? t.joinChannel : undefined}
          showKeys={fineInput}
          labels={t.training}
        />
      )}
    </div>
  )
}
