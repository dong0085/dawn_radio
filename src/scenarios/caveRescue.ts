import type { ScriptedScenario } from '../engine/sources/scripted'
import type { LogUpdate, Segment } from '../types'

const L = (speaker: 'rescue' | 'control', ...pairs: [string, string][]) => ({
  speaker,
  segments: pairs.map(([text, translation]) => ({ text, translation })),
})

/** French text with its English translation. */
const t = (text: string, translation: string): Segment => ({ text, translation })

/** Attaches a log update to a line. */
const logged = <T extends object>(line: T, log: LogUpdate) => ({ ...line, log })

const RESCUE = '#2fc4ff'
const CONTROL = '#ffb23f'

export const caveRescue: ScriptedScenario = {
  scenario: {
    id: 'cave-rescue',
    incident: 'Incident 04',
    title: 'Cave Rescue',
    channel: 'CH-04',
    frequency: '446.200 MHz',
    targetLang: 'fr-FR',
    nativeLang: 'en-US',
    premise:
      'A caver has gone missing near an underground lake. A rescue team searches the cave while Mission Control guides them from the surface. Heavy rain is on the way.',
    parties: [
      {
        id: 'rescue',
        name: 'Rescue Team',
        side: 'left',
        color: RESCUE,
        radio: { ambience: { kind: 'cave', src: '/sfx/cave.mp3', gain: 0.18 }, signal: 0.75 },
        voice: {
          elevenLabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
          browserVoiceNames: ['Thomas', 'Paul', 'Henri', 'Google français'],
          browserPitch: 0.85,
        },
      },
      {
        id: 'control',
        name: 'Mission Control',
        side: 'right',
        color: CONTROL,
        radio: { ambience: { kind: 'room', src: '/sfx/control-room.mp3', gain: 0.12 }, signal: 1 },
        voice: {
          elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL',
          browserVoiceNames: ['Amélie', 'Audrey', 'Marie', 'Denise', 'Google français'],
          browserPitch: 1.1,
        },
      },
    ],
    player: { name: 'You', color: '#3dff9a' },
    log: {
      title: 'Field log',
      nowTab: 'Now',
      timelineTab: 'Timeline',
      objectiveTitle: 'Objective',
      sections: [
        { id: 'who', title: 'Who' },
        { id: 'route', title: 'Route', layout: 'route' },
        { id: 'found', title: 'Found' },
        { id: 'hazards', title: 'Hazards' },
      ],
      emptySection: 'Nothing yet',
      emptyTimeline: 'No events logged yet.',
      newLabel: 'New',
      updatedNotice: 'Log updated',
      initial: {
        objective: t('Retrouver le spéléologue disparu', 'Find the missing caver'),
        entries: [
          { id: 'rescue', section: 'who', label: t('Équipe de secours', 'Rescue Team'), state: t('À l’entrée', 'At the entrance'), tone: 'active', color: RESCUE },
          { id: 'control', section: 'who', label: t('Contrôle', 'Mission Control'), state: t('En surface', 'At the surface'), color: CONTROL },
          { id: 'caver', section: 'who', label: t('Le spéléologue', 'The caver'), state: t('Disparu', 'Missing'), tone: 'alert' },
          { id: 'entrance', section: 'route', label: t('Entrée de la grotte', 'Cave entrance'), tone: 'active' },
          { id: 'rain', section: 'hazards', label: t('Pluie', 'Rain'), state: t('Annoncée', 'On the way'), tone: 'warn' },
        ],
      },
    },
  },

  batchSize: 4,

  script: [
    L('control', ['Équipe de secours, ici Contrôle. Quelle est votre position ?', 'Rescue Team, this is Control. What is your position?']),
    logged(
      L('rescue', ["Contrôle, nous sommes à l'entrée de la deuxième galerie.", "Control, we're at the entrance to the second tunnel."], ['Il fait très humide ici.', "It's very damp down here."]),
      {
        event: t('L’équipe atteint la deuxième galerie', 'The team reaches the second tunnel'),
        entries: [
          { id: 'rescue', state: t('En progression', 'Moving in') },
          { id: 'entrance', tone: 'done' },
          { id: 'tunnel2', section: 'route', label: t('Deuxième galerie', 'Second tunnel'), tone: 'active' },
        ],
      },
    ),
    logged(
      L('control', ['Bien reçu.', 'Copy that.'], ['Le spéléologue disparu a été vu près du lac souterrain.', 'The missing caver was last seen near the underground lake.']),
      {
        event: t('Dernière position connue : le lac souterrain', 'Last known position: the underground lake'),
        entries: [
          { id: 'caver', state: t('Vu près du lac', 'Last seen near the lake') },
          { id: 'lake', section: 'route', label: t('Lac souterrain', 'Underground lake') },
        ],
      },
    ),
    L('rescue', ['Compris. Nous avançons vers le lac.', "Understood. We're moving toward the lake."], ['Le passage est étroit.', 'The passage is narrow.']),

    logged(
      L('rescue', ['Contrôle, nous avons trouvé un autre passage.', 'Control, we found another passage.'], ['Il semble instable.', 'It looks unstable.']),
      {
        event: t('Nouveau passage découvert, instable', 'New passage found, unstable'),
        remove: ['lake'],
        entries: [
          { id: 'passage', section: 'route', label: t('Passage instable', 'Unstable passage') },
          { id: 'lake', section: 'route', label: t('Lac souterrain', 'Underground lake') },
          { id: 'unstable', section: 'hazards', label: t('Passage instable', 'Unstable passage'), state: t('Risque d’effondrement', 'May collapse'), tone: 'warn' },
        ],
      },
    ),
    L('control', ['Ne prenez aucun risque.', "Don't take any risks."], ['Voyez-vous des traces de passage ?', 'Can you see any signs that someone went through?']),
    logged(
      L('rescue', ['Oui. Il y a des empreintes dans la boue et une corde abandonnée.', 'Yes. There are footprints in the mud and an abandoned rope.']),
      {
        event: t('Empreintes et corde abandonnée', 'Footprints and an abandoned rope'),
        entries: [
          { id: 'footprints', section: 'found', label: t('Empreintes dans la boue', 'Footprints in the mud') },
          { id: 'rope', section: 'found', label: t('Corde abandonnée', 'Abandoned rope') },
        ],
      },
    ),
    L('control', ["C'est peut-être lui.", 'It might be him.'], ['Vérifiez vos lampes et votre corde avant de continuer.', 'Check your lamps and rope before you continue.']),

    logged(
      L('rescue', ['Tout est en ordre. Nous entrons dans le passage.', "Everything's fine. We're going into the passage."], ['Le plafond est très bas.', 'The ceiling is very low.']),
      {
        event: t('L’équipe entre dans le passage', 'The team enters the passage'),
        entries: [
          { id: 'rescue', state: t('Dans le passage', 'In the passage') },
          { id: 'tunnel2', tone: 'done' },
          { id: 'passage', tone: 'active' },
        ],
      },
    ),
    logged(
      L('control', ['Attention, la météo change en surface.', 'Careful, the weather is changing at the surface.'], ['Il commence à pleuvoir fort.', "It's starting to rain hard."]),
      {
        event: t('Forte pluie en surface', 'Heavy rain at the surface'),
        entries: [{ id: 'rain', state: t('Forte, en surface', 'Heavy, at the surface'), tone: 'alert' }],
      },
    ),
    logged(
      L('rescue', ['La pluie ? Le niveau de l’eau peut monter très vite ici.', 'Rain? The water level can rise very fast down here.']),
      {
        entries: [{ id: 'water', section: 'hazards', label: t('Niveau de l’eau', 'Water level'), state: t('Peut monter vite', 'Can rise fast'), tone: 'warn' }],
      },
    ),
    logged(
      L('control', ['Exactement. Vous avez environ une heure.', 'Exactly. You have about an hour.'], ['Après, il faudra ressortir.', "After that, you'll have to come back out."]),
      {
        event: t('Environ une heure avant de ressortir', 'About an hour before they must come out'),
        entries: [{ id: 'water', state: t('Environ 1 h', 'About 1 h left'), tone: 'alert' }],
      },
    ),

    logged(
      L('rescue', ['Contrôle, nous entendons quelque chose.', 'Control, we hear something.'], ['Une voix, je crois.', 'A voice, I think.']),
      {
        event: t('Une voix entendue', 'A voice is heard'),
        entries: [{ id: 'caver', state: t('Une voix entendue', 'A voice heard'), tone: 'warn' }],
      },
    ),
    L('control', ['Répondez-lui. Demandez-lui s’il est blessé.', "Answer him. Ask him if he's hurt."]),
    logged(
      L('rescue', ['Il est là ! Il est conscient,', "He's here! He's conscious,"], ['mais il dit qu’il a très mal à la jambe.', 'but he says his leg really hurts.']),
      {
        event: t('Spéléologue retrouvé, conscient', 'Caver found, conscious'),
        objective: t('Ramener le spéléologue à la surface', 'Bring the caver to the surface'),
        entries: [
          { id: 'caver', state: t('Retrouvé, blessé', 'Found, injured'), tone: 'warn' },
          { id: 'rescue', state: t('Avec le spéléologue', 'With the caver') },
          { id: 'passage', tone: 'done' },
          { id: 'lake', tone: 'active' },
        ],
      },
    ),
    L('control', ['Ne le déplacez pas trop vite.', "Don't move him too quickly."], ['Est-ce qu’il peut marcher ?', 'Can he walk?']),

    logged(
      L('rescue', ['Non. Sa cheville est peut-être cassée.', 'No. His ankle might be broken.'], ['Nous préparons une civière.', "We're getting a stretcher ready."]),
      {
        entries: [{ id: 'caver', state: t('Cheville cassée ?', 'Ankle may be broken'), tone: 'alert' }],
      },
    ),
    logged(
      L('control', ['Bien reçu. L’équipe médicale vous attend à l’entrée.', 'Copy. The medical team is waiting for you at the entrance.']),
      {
        entries: [{ id: 'medics', section: 'who', label: t('Équipe médicale', 'Medical team'), state: t('À l’entrée', 'At the entrance'), tone: 'ok' }],
      },
    ),
    logged(
      L('rescue', ['L’eau commence à monter dans la galerie.', 'The water is starting to rise in the tunnel.'], ['Nous partons maintenant.', "We're leaving now."]),
      {
        event: t('L’eau monte, l’équipe repart', 'Water rising, the team heads back'),
        entries: [
          { id: 'water', state: t('Monte', 'Rising'), tone: 'alert' },
          { id: 'rescue', state: t('Sur le retour', 'Heading back') },
        ],
      },
    ),
    L('control', ['Prenez le chemin le plus court.', 'Take the shortest route.'], ['Évitez le passage instable.', 'Stay away from the unstable passage.']),

    logged(
      L('rescue', ['Contrôle, nous voyons la lumière de l’entrée.', 'Control, we can see the light from the entrance.'], ['Encore cinquante mètres.', 'Fifty more meters.']),
      {
        entries: [
          { id: 'rescue', state: t('À 50 m de la sortie', '50 m from the exit') },
          { id: 'lake', tone: 'done' },
          { id: 'entrance', tone: 'active' },
        ],
      },
    ),
    L('control', ['Excellent travail. Les secours sont prêts.', 'Excellent work. The medics are ready.']),
    logged(
      L('rescue', ['Nous sommes sortis. Tout le monde est sain et sauf.', "We're out. Everyone is safe and sound."]),
      {
        event: t('Tout le monde est sorti', 'Everyone is out'),
        objective: { ...t('Ramener le spéléologue à la surface', 'Bring the caver to the surface'), done: true },
        entries: [
          { id: 'rescue', state: t('Sortie', 'Out'), tone: 'ok' },
          { id: 'caver', state: t('En sécurité', 'Safe'), tone: 'ok' },
        ],
      },
    ),
    L('control', ['Mission accomplie. Ici Contrôle, terminé.', 'Mission accomplished. Control, over and out.']),
  ],

  /** Played (in order, then looping) after each player transmission. */
  reactions: [
    [
      L('control', ['Station inconnue, ici Contrôle. Nous vous recevons.', 'Unknown station, this is Control. We read you.']),
      L('rescue', ['Bien reçu. Nous en tenons compte.', "Copy that. We'll keep that in mind."]),
    ],
    [
      L('rescue', ['Qui parle sur ce canal ?', "Who's talking on this channel?"], ['Identifiez-vous, s’il vous plaît.', 'Please identify yourself.']),
      L('control', ['C’est notre observateur. Continuez la mission.', "That's our observer. Carry on with the mission."]),
    ],
    [
      L('control', ['Message reçu, observateur.', 'Message received, observer.'], ['Restez à l’écoute.', 'Stay on the channel.']),
    ],
  ],

  ending: {
    outcome: 'success',
    title: 'Mission success',
    summary: 'The missing caver was found and brought out before the water rose.',
  },
}
