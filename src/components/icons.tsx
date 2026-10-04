import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const base = ({ size = 24, ...rest }: IconProps): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  ...rest,
})

export const PauseIcon = (p: IconProps) => (
  <svg {...base(p)} stroke="none" fill="currentColor">
    <rect x="6" y="4.5" width="4" height="15" rx="1" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" />
  </svg>
)

export const PlayIcon = (p: IconProps) => (
  <svg {...base(p)} stroke="none" fill="currentColor">
    <path d="M8 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L9.5 3.94A1 1 0 0 0 8 4.8Z" />
  </svg>
)

export const TranscriptIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M8.5 12h7M8.5 15.5h7M8.5 9h3" />
  </svg>
)

export const LogIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M8.5 10h.01M11.5 10h4M8.5 13.5h.01M11.5 13.5h4M8.5 17h.01M11.5 17h4" />
  </svg>
)

export const GearIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

export const ReplayIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
)

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const SendIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
)

export const SignalIcon = ({ bars = 4, ...p }: IconProps & { bars?: number }) => (
  <svg {...base(p)} stroke="none" fill="currentColor">
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x={4 + i * 4.4} y={17 - i * 3.6} width="2.8" height={3 + i * 3.6} rx="0.6" opacity={i < bars ? 1 : 0.25} />
    ))}
  </svg>
)

export const BatteryIcon = ({ level = 0.8, ...p }: IconProps & { level?: number }) => (
  <svg {...base(p)} viewBox="0 0 28 24">
    <rect x="2" y="7" width="21" height="10" rx="2" />
    <rect x="4" y="9" width={17 * level} height="6" rx="0.8" fill="currentColor" stroke="none" />
    <path d="M25 10.5v3" strokeWidth="2.2" />
  </svg>
)

export const ChevronIcon = ({ dir = 'left', ...p }: IconProps & { dir?: 'left' | 'right' }) => (
  <svg {...base(p)} stroke="none" fill="currentColor">
    <path d={dir === 'left' ? 'M15 5v14L6 12z' : 'M9 5v14l9-7z'} />
  </svg>
)
