import Chip from '@mui/material/Chip'
import { MATURE_IVL, type CardProgress } from '../lib/srs'

export function cardStateLabel(p: CardProgress | undefined): {
  label: string
  color: 'default' | 'info' | 'warning' | 'success'
  variant: 'filled' | 'outlined'
} {
  if (!p || p.st === 'new') return { label: 'New', color: 'info', variant: 'outlined' }
  if (p.st === 'learning') return { label: 'Learning', color: 'warning', variant: 'filled' }
  if (p.st === 'relearning') return { label: 'Relearning', color: 'warning', variant: 'outlined' }
  if (p.ivl >= MATURE_IVL) return { label: 'Mature', color: 'success', variant: 'filled' }
  return { label: 'Young', color: 'success', variant: 'outlined' }
}

export default function StateChip({ progress }: { progress: CardProgress | undefined }) {
  const { label, color, variant } = cardStateLabel(progress)
  return <Chip label={label} color={color} variant={variant} size="small" />
}
