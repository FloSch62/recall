import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CloseIcon from '@mui/icons-material/Close'
import UndoIcon from '@mui/icons-material/Undo'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import CelebrationIcon from '@mui/icons-material/Celebration'
import { useDeck } from '../lib/decks'
import { cardKey, store, useProgress } from '../lib/store'
import { emptyProgress, type Grade } from '../lib/srs'
import { StudySession } from '../lib/session'
import { formatDuration, formatPercent } from '../lib/format'
import type { Card as DeckCard } from '../lib/types'
import QuestionCard from '../components/QuestionCard'
import GradeBar from '../components/GradeBar'
import { ErrorState, Loading } from '../components/Feedback'

export default function StudyPage() {
  const { deckId = '' } = useParams()
  const { deck, error } = useDeck(deckId)
  const data = useProgress()
  const navigate = useNavigate()

  const sessionRef = useRef<StudySession | null>(null)
  const [ready, setReady] = useState(false)
  const [current, setCurrent] = useState<DeckCard | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [lastCard, setLastCard] = useState<DeckCard | null>(null)
  const cardStartRef = useRef(0)
  const sessionStartRef = useRef(0)

  useEffect(() => {
    if (!deck || sessionRef.current) return
    const now = Date.now()
    const session = new StudySession(deck, store.getSnapshot(), now)
    sessionRef.current = session
    sessionStartRef.current = now
    cardStartRef.current = now
    setCurrent(session.next(store.getSnapshot(), now))
    setReady(true)
  }, [deck])

  const revealed = picked !== null
  const suggested: Grade = picked !== null && picked !== '' && picked !== current?.answer ? 0 : 2

  const handlePick = (key: string) => {
    if (picked === null) setPicked(key)
  }

  const handleGrade = (g: Grade) => {
    const session = sessionRef.current
    if (!current || !session) return
    const correct = picked === '' || picked === null ? null : picked === current.answer
    store.grade(deckId, current.id, g, correct, Date.now() - cardStartRef.current)
    const snap = store.getSnapshot()
    const after = snap.cards[cardKey(deckId, current.id)]
    const now = Date.now()
    session.onAnswered(current, after, snap, now)
    setLastCard(current)
    setCurrent(session.next(snap, now))
    setPicked(null)
    cardStartRef.current = now
  }

  const handleUndo = () => {
    const session = sessionRef.current
    if (!lastCard || !session || !store.canUndo()) return
    store.undo()
    if (current) session.requeueFront(current)
    session.requeueFront(lastCard)
    session.answered = Math.max(0, session.answered - 1)
    setCurrent(lastCard)
    setLastCard(null)
    setPicked(null)
    cardStartRef.current = Date.now()
  }

  const handleRestart = () => {
    if (!deck) return
    const now = Date.now()
    const session = new StudySession(deck, store.getSnapshot(), now)
    const next = session.next(store.getSnapshot(), now)
    if (!next) return
    sessionRef.current = session
    setCurrent(next)
    setPicked(null)
    cardStartRef.current = now
  }

  // keyboard shortcuts: A–D / 1–4 to answer, space to reveal / suggested grade, 1–4 to grade, U to undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (!current) return
      if (e.key === 'u' || e.key === 'U') {
        handleUndo()
        return
      }
      if (picked === null) {
        const byNumber = ['1', '2', '3', '4'].indexOf(e.key)
        const byLetter = current.options.find((o) => o.key === e.key.toUpperCase())
        if (byNumber >= 0 && current.options[byNumber]) setPicked(current.options[byNumber].key)
        else if (byLetter) setPicked(byLetter.key)
        else if (e.key === ' ' || e.key === 'Enter') {
          setPicked('')
          e.preventDefault()
        }
      } else {
        const g = ['1', '2', '3', '4'].indexOf(e.key)
        if (g >= 0) handleGrade(g as Grade)
        else if (e.key === ' ' || e.key === 'Enter') {
          handleGrade(suggested)
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const sessionLog = useMemo(
    () => data.log.filter((l) => l.mode === 'srs' && l.deck === deckId && l.t >= sessionStartRef.current),
    [data.log, deckId],
  )

  const moreAvailable = useMemo(() => {
    if (!deck || current) return false
    return new StudySession(deck, data, Date.now()).remaining() > 0
  }, [deck, data, current])

  if (error) return <ErrorState message={error} />
  if (!deck || !ready) return <Loading />

  const session = sessionRef.current!
  const counts = session.counts(data)
  const currentProgress = current ? (data.cards[cardKey(deckId, current.id)] ?? emptyProgress()) : emptyProgress()
  const answeredCount = sessionLog.length
  const attempted = sessionLog.filter((l) => l.correct !== null)
  const correctCount = attempted.filter((l) => l.correct === true).length
  const remaining = session.remaining() + (current ? 1 : 0)
  const total = answeredCount + remaining
  const currentBucket =
    !current || currentProgress.st === 'new'
      ? 'new'
      : currentProgress.st === 'review'
        ? 'review'
        : 'learn'

  if (!current) {
    const empty = answeredCount === 0
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            {empty ? (
              <CelebrationIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
            ) : (
              <EmojiEventsIcon color="warning" sx={{ fontSize: 56, mb: 1 }} />
            )}
            <Typography variant="h5" sx={{ mb: 1 }}>
              {empty ? 'All caught up!' : 'Session complete!'}
            </Typography>
            {empty ? (
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                Nothing is due right now. Come back later, or run a practice round — practice never affects your
                schedule.
              </Typography>
            ) : (
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                {answeredCount} card{answeredCount === 1 ? '' : 's'} studied
                {attempted.length > 0 ? ` · ${formatPercent(correctCount, attempted.length)} answered correctly` : ''} ·{' '}
                {formatDuration(Date.now() - sessionStartRef.current)}
              </Typography>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
              {moreAvailable && (
                <Button variant="contained" onClick={handleRestart}>
                  Keep studying
                </Button>
              )}
              <Button variant={moreAvailable ? 'outlined' : 'contained'} onClick={() => navigate(`/deck/${deckId}`)}>
                Back to deck
              </Button>
              <Button variant="outlined" onClick={() => navigate(`/deck/${deckId}/practice`)}>
                Practice
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    )
  }

  return (
    <Container maxWidth="md" sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 'calc(100dvh - 64px)' }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Tooltip title="End session">
          <IconButton onClick={() => navigate(`/deck/${deckId}`)} aria-label="end session">
            <CloseIcon />
          </IconButton>
        </Tooltip>
        <LinearProgress
          variant="determinate"
          value={total ? (answeredCount / total) * 100 : 0}
          sx={{ flex: 1, height: 8, borderRadius: 4 }}
        />
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', px: 0.5 }}>
          <Box component="span" sx={{ color: 'info.main', fontWeight: currentBucket === 'new' ? 700 : 400 }}>
            {counts.newCount}
          </Box>
          {' · '}
          <Box component="span" sx={{ color: 'warning.main', fontWeight: currentBucket === 'learn' ? 700 : 400 }}>
            {counts.learnCount}
          </Box>
          {' · '}
          <Box component="span" sx={{ color: 'success.main', fontWeight: currentBucket === 'review' ? 700 : 400 }}>
            {counts.reviewCount}
          </Box>
        </Typography>
        <Tooltip title="Undo last answer (U)">
          <span>
            <IconButton onClick={handleUndo} disabled={!lastCard || !store.canUndo()} aria-label="undo">
              <UndoIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <QuestionCard
        deckId={deckId}
        card={current}
        moduleTitle={deck.modules[current.module]}
        picked={picked}
        revealed={revealed}
        onPick={handlePick}
      />

      <Box sx={{ flex: 1 }} />
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          bgcolor: 'background.default',
          pt: 1,
          pb: 'calc(env(safe-area-inset-bottom) + 8px)',
          zIndex: 1,
        }}
      >
        {revealed ? (
          <GradeBar progress={currentProgress} suggested={suggested} onGrade={handleGrade} />
        ) : (
          <Stack spacing={0.5}>
            <Button variant="outlined" fullWidth onClick={() => setPicked('')}>
              Show answer
            </Button>
            <Typography
              variant="caption"
              color="text.secondary"
              textAlign="center"
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              Pick with A–D or 1–4 · Space reveals · then 1–4 to grade
            </Typography>
          </Stack>
        )}
      </Box>
    </Container>
  )
}
