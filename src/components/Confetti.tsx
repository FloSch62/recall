import { useMemo } from 'react'
import Box from '@mui/material/Box'
import { keyframes } from '@emotion/react'

const fall = keyframes`
  0% { transform: translateY(-6vh) rotateZ(0deg) rotateY(0deg); opacity: 1; }
  100% { transform: translateY(106vh) rotateZ(540deg) rotateY(900deg); opacity: 0.7; }
`

const COLORS = ['#58cc02', '#1cb0f6', '#ce82ff', '#ff9600', '#ff4b4b', '#ffc800']

/** Full-screen celebratory confetti rain; purely decorative. */
export default function Confetti({ count = 90 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        dur: 2.4 + Math.random() * 2,
        size: 7 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        round: Math.random() < 0.3,
      })),
    [count],
  )
  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: (t) => t.zIndex.modal + 1,
        '@media (prefers-reduced-motion: reduce)': { display: 'none' },
      }}
    >
      {pieces.map((p, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 1.6,
            bgcolor: p.color,
            borderRadius: p.round ? '50%' : '2px',
            animation: `${fall} ${p.dur}s ${p.delay}s cubic-bezier(0.25, 0.4, 0.55, 1) both`,
          }}
        />
      ))}
    </Box>
  )
}
