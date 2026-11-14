const BADGE_STYLE: Record<string, { from: string; to: string; glyph: React.ReactNode }> = {
  first_vote: {
    from: '#0098fe',
    to: '#7fe0ff',
    glyph: <path d="M11 20.5L15.5 25L25 14" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  },
  first_motion: {
    from: '#ff00d7',
    to: '#ffc800',
    glyph: (
      <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="18" cy="18" r="6.5" />
        <path d="M18 8.5V12M18 24V27.5M8.5 18H12M24 18H27.5" />
        <circle cx="18" cy="18" r="1.6" fill="#fff" />
      </g>
    ),
  },
  all_colours: {
    from: '#5b8cff',
    to: '#ff5a4f',
    glyph: (
      <g>
        {['#5b8cff', '#3ec6ff', '#33d6a6', '#c6e04a', '#ffa63d', '#ff5a4f'].map((c, i) => (
          <rect key={c} x={9 + i * 3.1} y={11} width={2.6} height={14} rx={1.2} fill={c} stroke="#fff" strokeWidth="0.8" />
        ))}
      </g>
    ),
  },
  first_spectrum: {
    from: '#33d6a6',
    to: '#0098fe',
    glyph: <path d="M9 24C12 24 12.5 13 15.5 13C18.5 13 18 20 21 20C24 20 24.5 11 27 11" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" />,
  },
  infrared_only: {
    from: '#ff5a4f',
    to: '#3d0c45',
    glyph: (
      <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="18" cy="18" r="3.5" fill="#fff" />
        <path d="M18 9.5C22.7 9.5 26.5 13.3 26.5 18M18 26.5C13.3 26.5 9.5 22.7 9.5 18" strokeDasharray="3 3" />
      </g>
    ),
  },
  too_bright: {
    from: '#ffc800',
    to: '#ff7a00',
    glyph: (
      <g stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="18" cy="18" r="4.5" fill="#fff" />
        <path d="M18 8V10.5M18 25.5V28M8 18H10.5M25.5 18H28M11 11L12.8 12.8M23.2 23.2L25 25M11 25L12.8 23.2M23.2 12.8L25 11" />
      </g>
    ),
  },
  week_streak: {
    from: '#ff0000',
    to: '#ffc800',
    glyph: <path d="M18 9C18 13 23.5 14.5 23.5 20.5C23.5 24 21 27 18 27C15 27 12.5 24.5 12.5 21.5C12.5 18.5 14.5 17.5 15 15C16.5 16 17 17.5 17 19C18.5 17 18.5 12 18 9Z" fill="#fff" />,
  },
}

export function BadgeArt({ badge, size = 56, earned }: { badge: string; size?: number; earned: boolean }) {
  const s = BADGE_STYLE[badge] ?? BADGE_STYLE.first_vote
  const id = `badge-${badge}-${earned ? 'on' : 'off'}`
  if (!s) return null
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true" style={{ filter: earned ? undefined : 'grayscale(1)', opacity: earned ? 1 : 0.35 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={s.from} />
          <stop offset="100%" stopColor={s.to} />
        </linearGradient>
      </defs>
      <path d="M18 1.5L32.3 9.75V26.25L18 34.5L3.7 26.25V9.75L18 1.5Z" fill={`url(#${id})`} />
      <path d="M18 4.5L29.7 11.25V24.75L18 31.5L6.3 24.75V11.25L18 4.5Z" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
      {s.glyph}
    </svg>
  )
}

const LEVEL_COLORS = ['#7fe0ff', '#0098fe', '#33d6a6', '#ffc800', '#ff5a4f', '#ff00d7']

export function LevelArt({ level, size = 56 }: { level: number; size?: number }) {
  const c = LEVEL_COLORS[(level - 1) % LEVEL_COLORS.length] ?? '#7fe0ff'
  const id = `level-${level}`
  const n = Math.min(level, 6)
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="35%" stopColor={c} />
          <stop offset="100%" stopColor="#0a1014" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18.5" fill={`url(#${id})`} />
      <circle cx="20" cy="20" r="18.5" fill="none" stroke={c} strokeWidth="1.5" />
      {Array.from({ length: n }).map((_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2
        return <circle key={i} cx={20 + Math.cos(a) * 12} cy={20 + Math.sin(a) * 12} r={1.6} fill="#fff" />
      })}
      <text x="20" y="24.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fontFamily="var(--font-sans)">
        {level}
      </text>
    </svg>
  )
}
