import { cx } from '@/lib/format'

const PALETTE = [
  ['#3a1c71', '#d76d77', '#ffaf7b'],
  ['#0f2027', '#2c5364', '#7fe0ff'],
  ['#1d1145', '#5b42f3', '#00ddeb'],
  ['#2b1055', '#7597de', '#ffd1ff'],
  ['#0b3866', '#2e8bc0', '#b1d4e0'],
  ['#3d0c45', '#ff5a4f', '#ffc800'],
]

function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

export function UserAvatar({ nickname, size = 32, active = false, className }: { nickname: string | null; size?: number; active?: boolean; className?: string }) {
  const h = hash(nickname ?? 'guest')
  const [a, b, c] = PALETTE[h % PALETTE.length] as string[]
  const id = `ua-${h}`
  const stars = [0, 1, 2].map((i) => {
    const v = (h >> (i * 5)) & 31
    return { x: 6 + (v % 20), y: 6 + ((v * 7) % 20), r: 0.8 + (i === 0 ? 0.9 : 0.4) }
  })
  return (
    <span
      className={cx('inline-flex shrink-0 overflow-hidden rounded-full', active && 'ring-2 ring-text ring-offset-1 ring-offset-bg', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width={size} height={size}>
        <defs>
          <radialGradient id={id} cx="30%" cy="25%" r="90%">
            <stop offset="0%" stopColor={c} />
            <stop offset="45%" stopColor={b} />
            <stop offset="100%" stopColor={a} />
          </radialGradient>
        </defs>
        <rect width="32" height="32" fill={`url(#${id})`} />
        {nickname ? (
          stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={0.9 - i * 0.2} />)
        ) : (
          <path d="M16 9a4.5 4.5 0 1 1 0 9a4.5 4.5 0 0 1 0-9zm-8 16c1-4 4.5-6 8-6s7 2 8 6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
    </span>
  )
}
