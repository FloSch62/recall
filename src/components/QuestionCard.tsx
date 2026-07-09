import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import type { Theme } from '@mui/material/styles'
import type { Card as DeckCard, CardOption, Exhibit } from '../lib/types'
import { imageUrl } from '../lib/decks'
import MarkdownHtml from './MarkdownHtml'
import ImageLightbox from './ImageLightbox'
import CliExhibit from './CliExhibit'
import TopologyExhibit from './TopologyExhibit'

function ExhibitImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Box
        component="img"
        src={src}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        sx={{
          display: 'block',
          maxWidth: '100%',
          maxHeight: 360,
          mx: 'auto',
          my: 1.5,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          cursor: 'zoom-in',
          bgcolor: '#fff',
        }}
      />
      <ImageLightbox src={src} alt={alt} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

type OptionState = 'idle' | 'correct' | 'wrong' | 'dim'

function optionSx(state: OptionState) {
  return (theme: Theme) => {
    const vars = theme.vars ?? theme
    const tint = (channel: string, amount: string) => `rgba(${channel} / ${amount})`
    const base = {
      width: '100%',
      justifyContent: 'flex-start',
      textAlign: 'left' as const,
      gap: 1.5,
      px: 1.5,
      py: 1.25,
      borderRadius: 2,
      border: '1px solid',
      borderColor: theme.palette.divider,
      transition: theme.transitions.create(['border-color', 'background-color', 'opacity'], { duration: 150 }),
      alignItems: 'flex-start',
    }
    if (state === 'correct')
      return {
        ...base,
        borderColor: (vars as Theme).palette.success.main,
        backgroundColor: tint(theme.vars!.palette.success.mainChannel, '0.12'),
      }
    if (state === 'wrong')
      return {
        ...base,
        borderColor: (vars as Theme).palette.error.main,
        backgroundColor: tint(theme.vars!.palette.error.mainChannel, '0.10'),
      }
    if (state === 'dim') return { ...base, opacity: 0.55 }
    return {
      ...base,
      '@media (hover: hover)': {
        '&:hover': {
          borderColor: (vars as Theme).palette.primary.main,
          backgroundColor: tint(theme.vars!.palette.primary.mainChannel, '0.06'),
        },
      },
    }
  }
}

function OptionRow({
  option,
  state,
  revealed,
  onPick,
}: {
  option: CardOption
  state: OptionState
  revealed: boolean
  onPick?: (key: string) => void
}) {
  return (
    <ButtonBase focusRipple disabled={revealed || !onPick} onClick={() => onPick?.(option.key)} sx={optionSx(state)}>
      <Box
        sx={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: 13,
          fontWeight: 700,
          bgcolor: state === 'correct' ? 'success.main' : state === 'wrong' ? 'error.main' : 'action.selected',
          color: state === 'correct' || state === 'wrong' ? '#fff' : 'text.primary',
        }}
      >
        {option.key}
      </Box>
      <MarkdownHtml html={option.html} sx={{ flex: 1, pt: '2px' }} />
      {state === 'correct' && <CheckCircleIcon color="success" sx={{ flexShrink: 0 }} />}
      {state === 'wrong' && <CancelIcon color="error" sx={{ flexShrink: 0 }} />}
    </ButtonBase>
  )
}

export interface QuestionCardProps {
  deckId: string
  card: DeckCard
  moduleTitle?: string
  /** selected option key; '' means revealed without picking */
  picked: string | null
  revealed: boolean
  onPick?: (key: string) => void
}

export default function QuestionCard({ deckId, card, moduleTitle, picked, revealed, onPick }: QuestionCardProps) {
  const alertRef = useRef<HTMLDivElement>(null)
  // scroll only on an interactive reveal, not when mounted already-revealed (e.g. browsing)
  const prevRevealed = useRef(revealed)
  useEffect(() => {
    if (revealed && !prevRevealed.current) alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    prevRevealed.current = revealed
  }, [revealed])

  const optionState = (key: string): OptionState => {
    if (!revealed) return 'idle'
    if (key === card.answer) return 'correct'
    if (key === picked) return 'wrong'
    return 'dim'
  }

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Chip label={card.id} size="small" color="primary" variant="outlined" />
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
            {moduleTitle ? `${moduleTitle} · ` : ''}
            {card.page}
          </Typography>
        </Stack>

        <MarkdownHtml html={card.questionHtml} sx={{ fontSize: '1.05rem', fontWeight: 500 }} />

        {card.exhibits.map((ex: Exhibit, i: number) =>
          ex.type === 'cli' ? (
            <CliExhibit key={i} text={ex.text} />
          ) : ex.type === 'topology' ? (
            <TopologyExhibit key={i} spec={ex.spec} />
          ) : (
            <ExhibitImage key={i} src={imageUrl(deckId, ex.src)} alt={`Exhibit for ${card.id}`} />
          ),
        )}

        <Stack spacing={1} sx={{ mt: 2 }}>
          {card.options.map((o) => (
            <OptionRow key={o.key} option={o} state={optionState(o.key)} revealed={revealed} onPick={onPick} />
          ))}
        </Stack>

        {revealed && (
          <Alert
            ref={alertRef}
            severity={!picked ? 'info' : picked === card.answer ? 'success' : 'error'}
            sx={{ mt: 2, '& .MuiAlert-message': { minWidth: 0 } }}
          >
            <AlertTitle>
              {!picked
                ? `Answer: ${card.answer}`
                : picked === card.answer
                  ? 'Correct'
                  : `Incorrect — correct answer: ${card.answer}`}
            </AlertTitle>
            <MarkdownHtml html={card.explanationHtml} />
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
