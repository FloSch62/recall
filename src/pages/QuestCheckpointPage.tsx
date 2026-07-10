import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MarkdownHtml from '../components/MarkdownHtml'
import { ErrorState, Loading } from '../components/Feedback'
import { useDeck } from '../lib/decks'
import { buildQuest, checkpointIsComplete, questStore, useQuest } from '../lib/quest'
import { sfx } from '../lib/sounds'
import { UNIT_COLORS } from './QuestPage'

export default function QuestCheckpointPage() {
  const { deckId = '', checkpointId = '' } = useParams()
  const { deck, error } = useDeck(deckId)
  const data = useQuest()
  const navigate = useNavigate()
  const units = useMemo(() => (deck ? buildQuest(deck) : []), [deck])
  const step = units
    .flatMap((unit) => unit.steps)
    .find((candidate) => candidate.type === 'checkpoint' && candidate.checkpoint.id === checkpointId)

  if (error) return <ErrorState message={error} />
  if (!deck) return <Loading />
  if (!step || step.type !== 'checkpoint') return <ErrorState message="Checkpoint not found." />

  const unit = units.find((candidate) => candidate.module === step.unit)
  const color = UNIT_COLORS[step.unit % UNIT_COLORS.length]
  const alreadyComplete = checkpointIsComplete(data, deckId, step)
  const back = () => navigate(`/deck/${deckId}/quest`)

  const complete = () => {
    questStore.completeCheckpoint(deckId, step.checkpoint.id, Date.now())
    sfx.tap()
    back()
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3, minHeight: 'calc(100dvh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={back} aria-label="back to quest">
          <ArrowBackIcon />
        </IconButton>
        <Typography color="text.secondary" sx={{ flex: 1, fontWeight: 700 }} noWrap>
          {unit?.title ?? `Module ${step.unit + 1}`}
        </Typography>
        {alreadyComplete ? <Chip size="small" color="success" icon={<CheckRoundedIcon />} label="Completed" /> : null}
      </Stack>

      <Card
        sx={{
          borderRadius: 4,
          border: '2px solid',
          borderColor: color.main,
          boxShadow: `0 5px 0 ${color.dark}`,
          overflow: 'hidden',
          backgroundImage: 'none',
        }}
      >
        <Box
          sx={{
            p: 3,
            color: '#fff',
            bgcolor: color.main,
            backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.16), transparent)',
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 58,
                height: 58,
                borderRadius: 3,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(255,255,255,0.18)',
              }}
            >
              <LightbulbRoundedIcon sx={{ fontSize: 38 }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: 0.85 }}>
                SUMMARY CHECKPOINT
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                {step.checkpoint.title}
              </Typography>
            </Box>
          </Stack>
        </Box>
        <CardContent sx={{ px: { xs: 2.5, sm: 4 }, py: 3 }}>
          <MarkdownHtml
            html={step.checkpoint.contentHtml}
            sx={{
              '& h4': { mt: 2.5, mb: 1, color: color.main, fontSize: '1.05rem' },
              '& h4:first-of-type': { mt: 0 },
              '& li': { mb: 0.75 },
              '& p:last-child, & ul:last-child': { mb: 0 },
            }}
          />
        </CardContent>
      </Card>

      <Button
        fullWidth
        size="large"
        onClick={complete}
        sx={{
          mt: 3,
          py: 1.25,
          borderRadius: 3,
          bgcolor: color.main,
          color: '#fff',
          fontWeight: 900,
          letterSpacing: 0.5,
          boxShadow: `0 4px 0 ${color.dark}`,
          '&:hover': { bgcolor: color.main, filter: 'brightness(1.05)', boxShadow: `0 4px 0 ${color.dark}` },
          '&:active': { transform: 'translateY(3px)', boxShadow: '0 1px 0 transparent' },
        }}
      >
        CONTINUE
      </Button>
    </Container>
  )
}
