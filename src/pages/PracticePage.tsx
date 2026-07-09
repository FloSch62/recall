import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import CloseIcon from '@mui/icons-material/Close'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ReplayIcon from '@mui/icons-material/Replay'
import SportsScoreIcon from '@mui/icons-material/SportsScore'
import { useDeck } from '../lib/decks'
import { cardKey, store } from '../lib/store'
import { shuffle } from '../lib/session'
import { formatDuration, formatPercent } from '../lib/format'
import type { Card as DeckCard } from '../lib/types'
import QuestionCard from '../components/QuestionCard'
import { ErrorState, Loading } from '../components/Feedback'

type Phase = 'config' | 'run' | 'summary'

const COUNT_OPTIONS = [10, 25, 50, 0] as const // 0 = all

export default function PracticePage() {
  const { deckId = '' } = useParams()
  const { deck, error } = useDeck(deckId)
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('config')
  const [selModules, setSelModules] = useState<number[]>([])
  const [count, setCount] = useState<number>(25)
  const [shuffleOn, setShuffleOn] = useState(true)
  const [weakFirst, setWeakFirst] = useState(false)
  const [queue, setQueue] = useState<DeckCard[]>([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [wrong, setWrong] = useState<DeckCard[]>([])
  const [rightCount, setRightCount] = useState(0)
  const startRef = useRef(0)

  const beginWith = (cards: DeckCard[]) => {
    if (!cards.length) return
    setQueue(cards)
    setIdx(0)
    setPicked(null)
    setWrong([])
    setRightCount(0)
    startRef.current = Date.now()
    setPhase('run')
    window.scrollTo({ top: 0 })
  }

  const startPractice = () => {
    if (!deck) return
    let pool = deck.cards.filter((c) => selModules.length === 0 || selModules.includes(c.module))
    if (shuffleOn) pool = shuffle([...pool])
    if (weakFirst) {
      const snap = store.getSnapshot()
      const score = (c: DeckCard) => {
        const p = snap.cards[cardKey(deckId, c.id)]
        if (!p || p.seen === 0) return 0.5 // unseen sit between wrong and known
        return p.correct / p.seen
      }
      pool = [...pool].sort((a, b) => score(a) - score(b))
    }
    beginWith(count === 0 ? pool : pool.slice(0, count))
  }

  const current: DeckCard | undefined = queue[idx]

  const handlePick = (key: string) => {
    if (picked !== null || !current) return
    setPicked(key)
    if (key === '') {
      // revealed without answering — keep it in the retry list, don't log
      setWrong((w) => [...w, current])
      return
    }
    const ok = key === current.answer
    store.practice(deckId, current.id, ok)
    if (ok) setRightCount((r) => r + 1)
    else setWrong((w) => [...w, current])
  }

  const handleNext = () => {
    if (idx + 1 < queue.length) {
      setIdx(idx + 1)
      setPicked(null)
      window.scrollTo({ top: 0 })
    } else {
      setPhase('summary')
    }
  }

  useEffect(() => {
    if (phase !== 'run') return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (!current) return
      if (picked === null) {
        const byNumber = ['1', '2', '3', '4'].indexOf(e.key)
        const byLetter = current.options.find((o) => o.key === e.key.toUpperCase())
        if (byNumber >= 0 && current.options[byNumber]) handlePick(current.options[byNumber].key)
        else if (byLetter) handlePick(byLetter.key)
        else if (e.key === ' ' || e.key === 'Enter') {
          handlePick('')
          e.preventDefault()
        }
      } else if (e.key === ' ' || e.key === 'Enter') {
        handleNext()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error) return <ErrorState message={error} />
  if (!deck) return <Loading />

  if (phase === 'config') {
    const poolSize = deck.cards.filter((c) => selModules.length === 0 || selModules.includes(c.module)).length
    return (
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <IconButton onClick={() => navigate(`/deck/${deckId}`)} aria-label="back">
            <CloseIcon />
          </IconButton>
          <Typography variant="h5">Practice</Typography>
        </Stack>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Modules
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', rowGap: 1 }}>
              <Chip
                label="All modules"
                color={selModules.length === 0 ? 'primary' : 'default'}
                variant={selModules.length === 0 ? 'filled' : 'outlined'}
                onClick={() => setSelModules([])}
              />
              {deck.modules.map((title, i) => {
                const selected = selModules.includes(i)
                return (
                  <Chip
                    key={title}
                    label={title.split('—')[0].trim()}
                    color={selected ? 'primary' : 'default'}
                    variant={selected ? 'filled' : 'outlined'}
                    onClick={() =>
                      setSelModules((cur) => (selected ? cur.filter((m) => m !== i) : [...cur, i]))
                    }
                  />
                )
              })}
            </Stack>

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Number of questions
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={count}
              onChange={(_, v: number | null) => {
                if (v !== null) setCount(v)
              }}
              sx={{ mb: 3 }}
            >
              {COUNT_OPTIONS.map((c) => (
                <ToggleButton key={c} value={c} sx={{ px: 2.5 }}>
                  {c === 0 ? `All (${poolSize})` : c}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Stack sx={{ mb: 3 }}>
              <FormControlLabel
                control={<Switch checked={shuffleOn} onChange={(e) => setShuffleOn(e.target.checked)} />}
                label="Shuffle questions"
              />
              <FormControlLabel
                control={<Switch checked={weakFirst} onChange={(e) => setWeakFirst(e.target.checked)} />}
                label="Weakest first (wrong and unseen questions before known ones)"
              />
            </Stack>

            <Button
              variant="contained"
              size="large"
              startIcon={<PlayArrowIcon />}
              disabled={poolSize === 0}
              onClick={startPractice}
            >
              Start practice
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Practice records your accuracy but never changes the review schedule.
            </Typography>
          </CardContent>
        </Card>
      </Container>
    )
  }

  if (phase === 'summary') {
    const attempted = rightCount + wrong.length
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            <SportsScoreIcon color="primary" sx={{ fontSize: 56, mb: 1 }} />
            <Typography variant="h5" sx={{ mb: 1 }}>
              Practice finished
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {rightCount}/{attempted} correct ({formatPercent(rightCount, attempted)}) ·{' '}
              {formatDuration(Date.now() - startRef.current)}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
              {wrong.length > 0 && (
                <Button variant="contained" startIcon={<ReplayIcon />} onClick={() => beginWith(wrong)}>
                  Retry wrong ({wrong.length})
                </Button>
              )}
              <Button variant="outlined" onClick={() => setPhase('config')}>
                New practice
              </Button>
              <Button variant="outlined" onClick={() => navigate(`/deck/${deckId}`)}>
                Back to deck
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    )
  }

  if (!current) return <Loading />
  const revealed = picked !== null

  return (
    <Container maxWidth="md" sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 'calc(100dvh - 64px)' }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton onClick={() => setPhase('summary')} aria-label="end practice">
          <CloseIcon />
        </IconButton>
        <LinearProgress
          variant="determinate"
          value={((idx + (revealed ? 1 : 0)) / queue.length) * 100}
          sx={{ flex: 1, height: 8, borderRadius: 4 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {idx + 1}/{queue.length}
        </Typography>
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
          <Button variant="contained" fullWidth size="large" onClick={handleNext}>
            {idx + 1 < queue.length ? 'Next question' : 'Finish'}
          </Button>
        ) : (
          <Button variant="outlined" fullWidth onClick={() => handlePick('')}>
            Show answer
          </Button>
        )}
      </Box>
    </Container>
  )
}
