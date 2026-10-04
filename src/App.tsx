import { useCallback, useState, type CSSProperties } from 'react'
import { AnimatePresence } from 'motion/react'
import { RadioDevice } from './components/device/RadioDevice'
import { PhotoDevice } from './components/device/PhotoDevice'
import type { LedState } from './components/device/parts'
import type { DeviceControls, DeviceViewProps } from './components/device/types'
import { GearIcon, LogIcon, TranscriptIcon } from './components/icons'
import { DockedLog, LogPanel, type LogTab } from './components/screen/LogPanel'
import { SettingsPanel, TranscriptPanel } from './components/screen/Panels'
import { LiveIndicator, PartyBar, StatusBar, type LiveMode } from './components/screen/StatusBar'
import { Subtitle } from './components/screen/Subtitle'
import { MessageView, TransmitView } from './components/screen/Views'
import { Waveform } from './components/screen/Waveform'
import './components/screen/screen.css'
import { ScriptedSource } from './engine/sources/scripted'
import { AiSource } from './engine/sources/ai'
import { AutoSource } from './engine/sources/auto'
import { getConfig } from './api'
import { stories } from '../shared/stories.ts'
import { useConversation } from './engine/useConversation'
import { useClock } from './hooks/useClock'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useShortcuts } from './hooks/useShortcuts'
import { caveRescue } from './scenarios/caveRescue'
import { useSettings } from './settings'
import { defaultTheme, themeVars, type RadioTheme } from './theme'
import { PLAYER_ID, type Party } from './types'
import type { ScriptedScenario } from './engine/sources/scripted'
import { nexusSkin } from './skins/nexus'
import './layout.css'
import type { PhotoSkin } from './skins/types'

export interface AppProps {
  data?: ScriptedScenario
  theme?: RadioTheme
  /** Photo skin for the device; null draws the device in CSS instead. */
  skin?: PhotoSkin | null
}

type Overlay = 'log' | 'transcript' | 'settings'

const languageName = (tag: string, displayIn: string) => {
  try {
    return new Intl.DisplayNames([displayIn], { type: 'language' }).of(tag.split('-')[0]) ?? tag
  } catch {
    return tag
  }
}

export default function App({ data = caveRescue, theme = defaultTheme, skin = nexusSkin }: AppProps) {
  const { scenario } = data
  const [settings, update] = useSettings()
  const { state, conversation, config } = useConversation({
    scenario,
    settings,
    // Live feed: Claude writes the lines (when the server has a key); drill: the fixed recording.
    createSource: (getSettings) =>
      new AutoSource(async () => {
        const config = await getConfig()
        const live = getSettings().feed === 'live' && config.dialogue && !!stories[scenario.id]
        return live ? new AiSource({ storyId: scenario.id }) : new ScriptedSource(data)
      }),
  })
  const clock = useClock()
  const [overlay, setOverlayState] = useState<Overlay | null>(null)
  const [revealedLine, setRevealedLine] = useState<string | null>(null)
  const [logTab, setLogTab] = useState<LogTab>('now')
  /** Transcript line to scroll to, when opened from the log. */
  const [transcriptFocus, setTranscriptFocus] = useState<string | undefined>()

  // With room beside the radio, the log sits there, always open, instead of inside the screen.
  const { logSide, dockFrom } = theme.layout
  const docked = useMediaQuery(`(min-width: ${dockFrom}px)`) && !!scenario.log

  const logVersion = state.log.version
  /** Log version the player has seen. Everything after it is new. */
  const [seenVersion, setSeenVersion] = useState(0)
  // A docked log is always in view, so it is always seen.
  if (docked && seenVersion !== logVersion) setSeenVersion(logVersion)
  const logUnseen = !docked && overlay !== 'log' && logVersion > seenVersion

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

  const [left, right] = (['left', 'right'] as const).map((side) => scenario.parties.find((p) => p.side === side)!) as [Party, Party]
  const { phase, activity, paused, current, onAir, txMode } = state

  const transmitting = activity === 'transmitting' || activity === 'transcribing'
  const talkMode = settings.inputMode === 'keyboard' || txMode === 'keyboard' ? 'toggle' : 'hold'
  const speakerColor =
    onAir === PLAYER_ID ? scenario.player.color : (scenario.parties.find((p) => p.id === (onAir ?? current?.line.speaker))?.color ?? left.color)

  const press = () => {
    setOverlay(null)
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
    onTranscript: () => toggle('transcript'),
    // Docked, the log is already open: L switches its tab instead.
    onLog: () => (docked ? setLogTab((t) => (t === 'now' ? 'timeline' : 'now')) : scenario.log && toggle('log')),
    onEscape: () => (transmitting ? conversation.cancelTransmit() : setOverlay(null)),
  })

  const liveMode: LiveMode =
    phase === 'standby'
      ? 'standby'
      : phase === 'ended'
        ? 'off'
        : transmitting
          ? 'tx'
          : paused
            ? 'paused'
            : activity === 'waiting'
              ? 'loading'
              : 'live'

  const led: LedState =
    phase !== 'running' ? 'off' : transmitting ? 'tx' : activity === 'waiting' && !paused ? 'busy' : 'rx'

  const showTranslation = settings.showTranslation || revealedLine === current?.line.id

  const content = (() => {
    if (transmitting) {
      return (
        <TransmitView
          key="tx"
          label={`${scenario.player.name} · Transmitting`}
          color={scenario.player.color}
          text={state.txText}
          mode={txMode ?? 'voice'}
          processing={activity === 'transcribing'}
          onChange={(t) => conversation.setTxText(t)}
          onSubmit={() => void conversation.endTransmit()}
          onCancel={() => conversation.cancelTransmit()}
        />
      )
    }
    if (phase === 'standby') {
      return (
        <MessageView
          key="standby"
          eyebrow={`${scenario.channel} · ${scenario.frequency}`}
          title="Standby"
          body={scenario.premise}
          actions={
            <button type="button" className="chip chip--primary" onClick={() => conversation.start()}>
              Join channel
            </button>
          }
        />
      )
    }
    if (phase === 'ended' && state.ending && !current?.replay) {
      return (
        <MessageView
          key="ended"
          eyebrow="Channel closed"
          title={state.ending.title}
          tone={state.ending.outcome === 'success' ? 'var(--led-rx)' : state.ending.outcome === 'failure' ? 'var(--led-tx)' : undefined}
          body={state.ending.summary}
          actions={
            <>
              <button type="button" className="chip" onClick={() => setOverlay('transcript')}>
                Transcript
              </button>
              <button type="button" className="chip chip--primary" onClick={restart}>
                Rejoin channel
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
          label={`${scenario.player.name} · Awaiting reply`}
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
          onRevealTranslation={() => setRevealedLine(current.line.id)}
        />
      )
    }
    return <MessageView key="tuning" eyebrow={scenario.channel} title="Tuning in…" />
  })()

  const engineStatus =
    state.engine === 'elevenlabs' ? 'ElevenLabs active' : settings.voiceEngine === 'browser' ? 'Device voice' : 'ElevenLabs not set up'

  const controls: DeviceControls = {
    paused: paused || phase === 'standby',
    onPauseToggle: () => conversation.togglePause(),
    talk: {
      pressed: transmitting,
      mode: talkMode,
      lightColor: scenario.player.color,
      label: talkMode === 'toggle' ? 'Tap to talk' : 'Hold to talk',
      activeLabel: talkMode === 'toggle' ? 'Cancel' : 'Transmitting',
      disabled: phase === 'ended',
      onPress: press,
      onRelease: release,
    },
    replay: {
      onReplay: () => conversation.replay(),
      disabled: phase === 'standby' || transmitting,
    },
  }

  // The docked log shows its own changes, so the screen skips the "log updated" notice.
  const notice = docked && state.notice === scenario.log?.updatedNotice ? null : state.notice
  const toggleTranslation = () => update('showTranslation', !settings.showTranslation)
  const openLine = (lineId: string) => {
    setTranscriptFocus(lineId)
    setOverlay('transcript')
  }

  const screen = (
    <div className={`screen${phase !== 'standby' ? ' screen--booting' : ''}`} key={phase === 'standby' ? 'off' : 'on'}>
      <StatusBar
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
          {
            id: 'transcript',
            label: 'Transcript',
            icon: <TranscriptIcon size={18} />,
            active: overlay === 'transcript',
            onClick: () => toggle('transcript'),
          },
          {
            id: 'settings',
            label: 'Settings',
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
          center={<LiveIndicator mode={liveMode} />}
        />
        <div className="main-panel__content">
          <AnimatePresence mode="wait">{content}</AnimatePresence>
          {notice && <span className="notice">{notice}</span>}
        </div>
      </div>

      <Waveform
        getLevel={() => conversation.getLevel()}
        color={speakerColor}
        leftLabel={transmitting ? 'TX' : 'RX'}
        rightLabel={scenario.channel}
      />

      <AnimatePresence>
        {overlay === 'transcript' && (
          <TranscriptPanel
            key="transcript"
            entries={state.transcript}
            parties={scenario.parties}
            player={scenario.player}
            showTranslation={settings.showTranslation}
            onToggleTranslation={() => update('showTranslation', !settings.showTranslation)}
            onClose={() => setOverlay(null)}
            liveId={onAir && onAir !== PLAYER_ID ? current?.line.id : undefined}
            focusId={transcriptFocus}
            targetLang={scenario.targetLang}
          />
        )}
        {overlay === 'log' && scenario.log && !docked && (
          <LogPanel
            key="log"
            config={scenario.log}
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
        {overlay === 'settings' && (
          <SettingsPanel
            key="settings"
            settings={settings}
            update={update}
            onClose={() => setOverlay(null)}
            onRestart={restart}
            engineStatus={engineStatus}
            feedNote={config && !config.dialogue ? 'Live feed offline' : 'Applies when you rejoin'}
            showAccessCode={!!config?.accessCode}
            targetLabel={languageName(scenario.targetLang, scenario.nativeLang)}
            nativeLabel={languageName(scenario.nativeLang, scenario.nativeLang)}
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

  return (
    <div
      className={`layout${docked ? ` layout--dock-${logSide}` : ''}`}
      style={
        {
          ...vars,
          '--device-ratio': skin ? skin.width / skin.height : theme.designWidth / theme.designHeight,
          // Match the page to the photo backdrop so the radio's area blends in.
          background: skin?.backdrop,
        } as CSSProperties
      }
    >
      <div className="layout__device">
        {skin ? <PhotoDevice skin={skin} theme={theme} {...device} /> : <RadioDevice theme={theme} {...device} />}
      </div>
      {docked && scenario.log && (
        <DockedLog
          side={logSide}
          config={scenario.log}
          log={state.log}
          tab={logTab}
          onTabChange={setLogTab}
          showTranslation={settings.showTranslation}
          onToggleTranslation={toggleTranslation}
          onOpenLine={openLine}
          lang={scenario.targetLang}
        />
      )}
    </div>
  )
}
