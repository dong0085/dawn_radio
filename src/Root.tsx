import App from './App'
import { channelData } from './channels/build'
import { useChannels } from './channels/useChannels'
import { caveRescue } from './scenarios/caveRescue'

const preset = { scenario: caveRescue.scenario, level: 'A2–B1' }

/** Picks the channel the radio is tuned to. Changing channel mounts a fresh radio. */
export function Root() {
  const { controller, current } = useChannels(preset)
  const data = current ? channelData(current) : caveRescue
  return <App key={data.scenario.id} data={data} channels={controller} />
}
