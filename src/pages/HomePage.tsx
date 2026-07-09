import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AddIcon from '@mui/icons-material/Add'
import { useNavigate } from 'react-router-dom'
import type { DeckSummary } from '../lib/types'
import { useDeckIndex } from '../lib/decks'
import { useProgress, type ProgressData } from '../lib/store'
import { homeDeckCounts } from '../lib/stats'
import { stripHtml } from '../lib/format'
import { ErrorState, Loading } from '../components/Feedback'

const clamp2 = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
} as const

function DeckSummaryCard({ summary, data, now }: { summary: DeckSummary; data: ProgressData; now: number }) {
  const navigate = useNavigate()
  const c = homeDeckCounts(summary.id, summary.cardCount, data, now)
  const due = c.dueReviews + c.dueLearning
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardActionArea onClick={() => navigate(`/deck/${summary.id}`)} sx={{ flex: 1 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={clamp2}>
            {summary.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ ...clamp2, mb: 1.5, minHeight: 40 }}>
            {stripHtml(summary.description)}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
            {summary.origin === 'imported' && <Chip size="small" label="imported" />}
            <Chip size="small" variant="outlined" color="info" label={`${c.newRemaining} new`} />
            <Chip size="small" variant="outlined" color="warning" label={`${c.learning} learning`} />
            <Chip size="small" variant="outlined" color="success" label={`${due} due`} />
          </Stack>
          <LinearProgress
            variant="determinate"
            value={c.total ? (c.started / c.total) * 100 : 0}
            sx={{ height: 6, borderRadius: 3, mb: 0.75 }}
          />
          <Typography variant="caption" color="text.secondary">
            {c.started}/{summary.cardCount} started · {c.mature} mastered
          </Typography>
        </CardContent>
      </CardActionArea>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<PlayArrowIcon />}
          onClick={() => navigate(`/deck/${summary.id}/study`)}
        >
          Study
        </Button>
        <Button size="small" onClick={() => navigate(`/deck/${summary.id}/practice`)}>
          Practice
        </Button>
        <Button size="small" onClick={() => navigate(`/deck/${summary.id}/browse`)}>
          Browse
        </Button>
      </CardActions>
    </Card>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { index, error } = useDeckIndex()
  const data = useProgress()
  const now = Date.now()

  if (error) return <ErrorState message={error} />
  if (!index) return <Loading />

  const totalDue = index.decks.reduce((acc, d) => {
    const c = homeDeckCounts(d.id, d.cardCount, data, now)
    return acc + c.dueReviews + c.dueLearning
  }, 0)

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="baseline" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5">Decks</Typography>
        <Typography variant="body2" color="text.secondary">
          {totalDue > 0 ? `${totalDue} card${totalDue === 1 ? '' : 's'} due today` : 'All caught up 🎉'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => navigate('/import')}>
          Import deck
        </Button>
      </Stack>
      <Grid container spacing={2}>
        {index.decks.map((d) => (
          <Grid key={d.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <DeckSummaryCard summary={d} data={data} now={now} />
          </Grid>
        ))}
      </Grid>
      {index.decks.length === 0 && (
        <Typography color="text.secondary">
          No decks yet. Import one (markdown, GitHub or URL) or add a folder with a questions.md under public/decks/.
        </Typography>
      )}
    </Container>
  )
}
