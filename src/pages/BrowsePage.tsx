import { useDeferredValue, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import Pagination from '@mui/material/Pagination'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Chip from '@mui/material/Chip'
import SearchIcon from '@mui/icons-material/Search'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CloseIcon from '@mui/icons-material/Close'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { useDeck } from '../lib/decks'
import { cardKey, useProgress } from '../lib/store'
import { endOfToday, MATURE_IVL, type CardProgress } from '../lib/srs'
import { formatDueIn, formatPercent, stripHtml } from '../lib/format'
import type { Card as DeckCard } from '../lib/types'
import QuestionCard from '../components/QuestionCard'
import StateChip from '../components/StateChip'
import { ErrorState, Loading } from '../components/Feedback'

const PER_PAGE = 50

type StateFilter = 'all' | 'new' | 'learning' | 'young' | 'mature' | 'due' | 'wrong'

const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: 'all', label: 'All states' },
  { value: 'due', label: 'Due today' },
  { value: 'new', label: 'New' },
  { value: 'learning', label: 'Learning' },
  { value: 'young', label: 'Young' },
  { value: 'mature', label: 'Mature' },
  { value: 'wrong', label: 'Answered wrong before' },
]

function matchesState(filter: StateFilter, p: CardProgress | undefined, now: number): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'new':
      return !p || p.st === 'new'
    case 'learning':
      return !!p && (p.st === 'learning' || p.st === 'relearning')
    case 'young':
      return !!p && p.st === 'review' && p.ivl < MATURE_IVL
    case 'mature':
      return !!p && p.st === 'review' && p.ivl >= MATURE_IVL
    case 'due':
      return !!p && p.st !== 'new' && p.due <= endOfToday(now)
    case 'wrong':
      return !!p && p.seen > 0 && p.correct < p.seen
  }
}

export default function BrowsePage() {
  const { deckId = '' } = useParams()
  const { deck, error } = useDeck(deckId)
  const data = useProgress()
  const navigate = useNavigate()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [moduleFilter, setModuleFilter] = useState<number>(-1)
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<DeckCard | null>(null)

  const searchable = useMemo(() => {
    if (!deck) return []
    return deck.cards.map((card) => ({
      card,
      text: `${card.id} ${stripHtml(card.questionHtml)} ${card.options.map((o) => stripHtml(o.html)).join(' ')}`.toLowerCase(),
      snippet: stripHtml(card.questionHtml),
    }))
  }, [deck])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const now = Date.now()
    return searchable.filter(({ card, text }) => {
      if (moduleFilter >= 0 && card.module !== moduleFilter) return false
      if (!matchesState(stateFilter, data.cards[cardKey(deckId, card.id)], now)) return false
      if (q && !text.includes(q)) return false
      return true
    })
  }, [searchable, deferredQuery, moduleFilter, stateFilter, data.cards, deckId])

  if (error) return <ErrorState message={error} />
  if (!deck) return <Loading />

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safePage = Math.min(page, pageCount)
  const visible = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)
  const now = Date.now()
  const selectedProgress = selected ? data.cards[cardKey(deckId, selected.id)] : undefined

  // step through the current filtered list from inside the dialog
  const selectedIdx = selected ? filtered.findIndex(({ card }) => card.id === selected.id) : -1
  const step = (delta: number) => {
    if (selectedIdx < 0) return
    const next = filtered[selectedIdx + delta]
    if (next) setSelected(next.card)
  }

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate(`/deck/${deckId}`)} aria-label="back to deck">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }} noWrap>
          Browse · {deck.title}
        </Typography>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search questions…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          size="small"
          value={moduleFilter}
          onChange={(e) => {
            setModuleFilter(Number(e.target.value))
            setPage(1)
          }}
          sx={{ minWidth: { sm: 190 } }}
        >
          <MenuItem value={-1}>All modules</MenuItem>
          {deck.modules.map((title, i) => (
            <MenuItem key={title} value={i}>
              {title.split('—')[0].trim()}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={stateFilter}
          onChange={(e) => {
            setStateFilter(e.target.value as StateFilter)
            setPage(1)
          }}
          sx={{ minWidth: { sm: 190 } }}
        >
          {STATE_FILTERS.map((f) => (
            <MenuItem key={f.value} value={f.value}>
              {f.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {filtered.length} of {deck.cards.length} questions
      </Typography>

      <Card>
        <List disablePadding>
          {visible.map(({ card, snippet }, i) => {
            const p = data.cards[cardKey(deckId, card.id)]
            return (
              <Box key={card.id}>
                {i > 0 && <Divider component="li" />}
                <ListItemButton onClick={() => setSelected(card)} sx={{ gap: 1.5, alignItems: 'center' }}>
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        <Box component="span" sx={{ color: 'primary.main', fontWeight: 700, mr: 1 }}>
                          {card.id}
                        </Box>
                        {snippet}
                      </Typography>
                    }
                    secondary={
                      p && p.st !== 'new'
                        ? `due ${formatDueIn(p.due, now)} · ${p.seen ? `accuracy ${formatPercent(p.correct, p.seen)}` : 'not answered yet'}`
                        : p?.seen
                          ? `answered · accuracy ${formatPercent(p.correct, p.seen)}`
                          : undefined
                    }
                  />
                  <StateChip progress={p} />
                </ListItemButton>
              </Box>
            )
          })}
          {visible.length === 0 && (
            <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
              No questions match the current filters.
            </Typography>
          )}
        </List>
      </Card>

      {pageCount > 1 && (
        <Stack alignItems="center" sx={{ my: 2 }}>
          <Pagination count={pageCount} page={safePage} onChange={(_, p) => setPage(p)} />
        </Stack>
      )}

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        fullScreen={fullScreen}
        maxWidth="md"
        fullWidth
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') step(-1)
          else if (e.key === 'ArrowRight') step(1)
        }}
      >
        {selected && (
          <>
            <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Toolbar variant="dense" sx={{ gap: 0.5 }}>
                <Typography variant="subtitle1" sx={{ flex: 1 }} noWrap>
                  {selected.id}
                </Typography>
                <StateChip progress={selectedProgress} />
                {selectedProgress && selectedProgress.st !== 'new' && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`due ${formatDueIn(selectedProgress.due, now)}`}
                    sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                  />
                )}
                <IconButton onClick={() => step(-1)} disabled={selectedIdx <= 0} aria-label="previous question">
                  <ChevronLeftIcon />
                </IconButton>
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {selectedIdx + 1} / {filtered.length}
                </Typography>
                <IconButton
                  onClick={() => step(1)}
                  disabled={selectedIdx < 0 || selectedIdx >= filtered.length - 1}
                  aria-label="next question"
                >
                  <ChevronRightIcon />
                </IconButton>
                <IconButton onClick={() => setSelected(null)} aria-label="close">
                  <CloseIcon />
                </IconButton>
              </Toolbar>
            </AppBar>
            <DialogContent key={selected.id} sx={{ p: { xs: 1, sm: 2 }, bgcolor: 'background.default' }}>
              <QuestionCard
                deckId={deckId}
                card={selected}
                moduleTitle={deck.modules[selected.module]}
                picked={null}
                revealed
              />
              {selectedProgress && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, px: 1 }}>
                  reviews {selectedProgress.reps} · lapses {selectedProgress.lapses} · interval{' '}
                  {selectedProgress.ivl}d · ease {selectedProgress.ease.toFixed(2)} · answered{' '}
                  {selectedProgress.seen}× ({formatPercent(selectedProgress.correct, selectedProgress.seen)} correct)
                </Typography>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>
    </Container>
  )
}
