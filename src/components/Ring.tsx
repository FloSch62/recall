import Box from '@mui/material/Box'

interface RingProps {
  size: number
  stroke: number
  /** 0..1, clamped */
  progress: number
  color: string
  track?: string
  children?: React.ReactNode
}

/** Circular progress ring with arbitrary centered content. */
export default function Ring({ size, stroke, progress, color, track = 'rgba(255,255,255,0.25)', children }: RingProps) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - p)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</Box>
    </Box>
  )
}
