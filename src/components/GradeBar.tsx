import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { nextProgress, type CardProgress, type Grade } from '../lib/srs'
import { formatDelay } from '../lib/format'

const DEFS = [
  { label: 'Again', color: 'error' as const },
  { label: 'Hard', color: 'warning' as const },
  { label: 'Good', color: 'success' as const },
  { label: 'Easy', color: 'info' as const },
]

interface Props {
  progress: CardProgress
  suggested: Grade
  onGrade: (g: Grade) => void
}

export default function GradeBar({ progress, suggested, onGrade }: Props) {
  const now = Date.now()
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
      {DEFS.map((d, i) => {
        const g = i as Grade
        return (
          <Button
            key={d.label}
            color={d.color}
            variant={suggested === g ? 'contained' : 'outlined'}
            onClick={() => onGrade(g)}
            sx={{ flexDirection: 'column', py: 0.75, lineHeight: 1.3, minHeight: 56 }}
          >
            {d.label}
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {formatDelay(nextProgress(progress, g, now).due - now)}
            </Typography>
          </Button>
        )
      })}
    </Box>
  )
}
