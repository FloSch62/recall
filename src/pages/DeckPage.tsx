import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ShuffleIcon from '@mui/icons-material/Shuffle'
import SearchIcon from '@mui/icons-material/Search'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import SyncIcon from '@mui/icons-material/Sync'
import Chip from '@mui/material/Chip'
import Snackbar from '@mui/material/Snackbar'
import { useDeck } from '../lib/decks'
import { deleteImportedDeck, describeSource, getImportedDeck, saveImportedDeck, useImportedVersion } from '../lib/importedDecks'
import { refetchFromSource } from '../lib/importSource'
import { store, useProgress } from '../lib/store'
import { deckCounts, moduleCounts, sessionEstimate } from '../lib/stats'
import { formatPercent } from '../lib/format'
import { ConfirmDialog, ErrorState, Loading } from '../components/Feedback'
import MarkdownHtml from '../components/MarkdownHtml'

function StatTile({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <Card sx={{ textAlign: 'center' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Typography variant="h5" sx={{ color }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      </CardContent>
    </Card>
  )
}

export default function DeckPage() {
  const { deckId = '' } = useParams()
  const { deck, error } = useDeck(deckId)
  const data = useProgress()
  const navigate = useNavigate()
  const [resetOpen, setResetOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [snack, setSnack] = useState<string | null>(null)
  const importedVersion = useImportedVersion()
  const imported = useMemo(() => getImportedDeck(deckId), [deckId, importedVersion])

  const counts = useMemo(() => (deck ? deckCounts(deck, data, Date.now()) : null), [deck, data])
  const modules = useMemo(() => (deck ? moduleCounts(deck, data) : []), [deck, data])

  const updateFromSource = async () => {
    if (!imported || imported.source.type === 'manual') return
    setUpdating(true)
    try {
      const prep = await refetchFromSource(imported.source)
      await saveImportedDeck({ ...prep.deck, id: deckId }, imported.source)
      setSnack(`Deck updated from source (${prep.deck.cards.length} questions).`)
    } catch (e) {
      setSnack(e instanceof Error ? e.message : 'Update failed.')
    } finally {
      setUpdating(false)
    }
  }

  if (error) return <ErrorState message={error} />
  if (!deck || !counts) return <Loading />

  const est = sessionEstimate(counts, data, deckId, Date.now())
  const due = counts.dueReviews + counts.dueLearning

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {deck.title}
      </Typography>
      <MarkdownHtml html={deck.description} sx={{ color: 'text.secondary', fontSize: 14, mb: imported ? 1 : 2.5 }} />
      {imported && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2.5, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Chip size="small" label="imported" />
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
            {describeSource(imported.source)} · updated {new Date(imported.updatedAt).toLocaleDateString()}
          </Typography>
        </Stack>
      )}

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 4 }}>
          <StatTile value={counts.newRemaining} label="New" color="info.main" />
        </Grid>
        <Grid size={{ xs: 4 }}>
          <StatTile value={counts.learning} label="Learning" color="warning.main" />
        </Grid>
        <Grid size={{ xs: 4 }}>
          <StatTile value={due} label="Due today" color="success.main" />
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={() => navigate(`/deck/${deckId}/study`)}
        >
          Study{est > 0 ? ` (${est})` : ''}
        </Button>
        <Button variant="outlined" startIcon={<ShuffleIcon />} onClick={() => navigate(`/deck/${deckId}/practice`)}>
          Practice
        </Button>
        <Button variant="outlined" startIcon={<SearchIcon />} onClick={() => navigate(`/deck/${deckId}/browse`)}>
          Browse
        </Button>
      </Stack>

      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Overall progress
          </Typography>
          <LinearProgress
            variant="determinate"
            value={counts.total ? (counts.started / counts.total) * 100 : 0}
            sx={{ height: 8, borderRadius: 4, mb: 1 }}
          />
          <Typography variant="caption" color="text.secondary">
            {counts.started}/{counts.total} started · {counts.mature} mastered · answer accuracy{' '}
            {formatPercent(counts.correct, counts.seen)}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Modules
          </Typography>
          <Stack spacing={2}>
            {deck.modules.map((title, i) => {
              const m = modules[i]
              return (
                <Box key={title}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    {title}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={m.total ? (m.started / m.total) * 100 : 0}
                    sx={{ height: 6, borderRadius: 3, mb: 0.25 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {m.started}/{m.total} started · {m.mature} mastered · accuracy {formatPercent(m.correct, m.seen)}
                  </Typography>
                </Box>
              )
            })}
          </Stack>
        </CardContent>
      </Card>

      <Stack direction="row" spacing={1} sx={{ mt: 3, justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 1 }}>
        {imported && imported.source.type !== 'manual' && (
          <Button size="small" startIcon={<SyncIcon />} disabled={updating} onClick={() => void updateFromSource()}>
            {updating ? 'Updating…' : 'Update from source'}
          </Button>
        )}
        {imported && (
          <Button color="error" size="small" startIcon={<RemoveCircleOutlineIcon />} onClick={() => setRemoveOpen(true)}>
            Remove deck
          </Button>
        )}
        <Button color="error" size="small" startIcon={<DeleteOutlineIcon />} onClick={() => setResetOpen(true)}>
          Reset deck progress
        </Button>
      </Stack>
      <ConfirmDialog
        open={removeOpen}
        title="Remove this deck?"
        message={`This removes the imported deck "${deck.title}" from this browser. Study progress is kept — import the deck again with the same ID to continue where you left off.`}
        confirmLabel="Remove deck"
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => {
          void deleteImportedDeck(deckId).then(() => navigate('/'))
        }}
      />
      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
      <ConfirmDialog
        open={resetOpen}
        title="Reset deck progress?"
        message={`This permanently removes all review history and scheduling for "${deck.title}". Consider exporting your progress first (Settings → Export).`}
        confirmLabel="Reset deck"
        onClose={() => setResetOpen(false)}
        onConfirm={() => store.resetDeck(deckId)}
      />
    </Container>
  )
}
