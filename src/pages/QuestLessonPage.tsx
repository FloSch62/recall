import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { keyframes } from '@emotion/react'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import type { Theme } from '@mui/material/styles'
import { imageUrl, useDeck } from '../lib/decks'
import { store } from '../lib/store'
import { shuffle } from '../lib/session'
import {
  DAILY_GOAL_XP,
  buildQuest,
  lessonXp,
  levelFor,
  questStore,
  starsFor,
  totalXp,
  xpToday,
  type QuestLesson,
} from '../lib/quest'
import { sfx } from '../lib/sounds'
import { formatDuration, formatPercent } from '../lib/format'
import type { Card as DeckCard, Exhibit } from '../lib/types'
import MarkdownHtml from '../components/MarkdownHtml'
import CliExhibit from '../components/CliExhibit'
import TopologyExhibit from '../components/TopologyExhibit'
import Confetti from '../components/Confetti'
import { ConfirmDialog, ErrorState, Loading } from '../components/Feedback'

const GREEN = '#58cc02'
const GREEN_DARK = '#46a302'
const RED = '#ff4b4b'
const RED_DARK = '#d33636'
const GOLD = '#ffc800'

const PRAISE = ['Nice!', 'Correct!', 'Great job!', 'Awesome!', 'Excellent!']

const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-7px); }
  40%, 80% { transform: translateX(7px); }
`

const pop = keyframes`
  0% { transform: scale(0); }
  70% { transform: scale(1.25); }
  100% { transform: scale(1); }
`

const slideUp = keyframes`
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
`

const shine = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(350%); }
`

const flyOut = keyframes`
  0% { transform: translateX(10px) scale(1); opacity: 1; }
  100% { transform: translateX(46px) scale(0.3); opacity: 0; }
`

/** Little particles radiating out of the option badge on a correct answer. */
function SparkleBurst() {
  return (
    <Box
      aria-hidden
      sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', '@media (prefers-reduced-motion: reduce)': { display: 'none' } }}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <Box
          key={i}
          sx={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, transform: `rotate(${i * 45}deg)` }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: -3,
              left: 0,
              width: i % 2 ? 5 : 7,
              height: i % 2 ? 5 : 7,
              borderRadius: i % 2 ? '50%' : '2px',
              bgcolor: i % 2 ? GOLD : GREEN,
              animation: `${flyOut} 0.55s ease-out both`,
            }}
          />
        </Box>
      ))}
    </Box>
  )
}

type OptionState = 'idle' | 'correct' | 'wrong' | 'dim'

function optionSx(state: OptionState) {
  return (theme: Theme) => {
    const tint = (channel: string, amount: string) => `rgba(${channel} / ${amount})`
    const base = {
      width: '100%',
      justifyContent: 'flex-start',
      textAlign: 'left' as const,
      alignItems: 'flex-start',
      gap: 1.5,
      px: 2,
      py: 1.5,
      borderRadius: 3,
      border: '2px solid',
      borderColor: theme.palette.divider,
      boxShadow: `0 3px 0 ${theme.vars ? theme.vars.palette.divider : theme.palette.divider}`,
      transition: theme.transitions.create(['border-color', 'background-color', 'opacity', 'transform', 'box-shadow'], {
        duration: 120,
      }),
    }
    if (state === 'correct')
      return {
        ...base,
        borderColor: GREEN,
        boxShadow: `0 3px 0 ${GREEN_DARK}`,
        backgroundColor: tint(theme.vars!.palette.success.mainChannel, '0.14'),
      }
    if (state === 'wrong')
      return {
        ...base,
        borderColor: RED,
        boxShadow: `0 3px 0 ${RED_DARK}`,
        backgroundColor: tint(theme.vars!.palette.error.mainChannel, '0.12'),
        animation: `${shake} 0.4s ease-in-out`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }
    if (state === 'dim') return { ...base, opacity: 0.5 }
    return {
      ...base,
      '&:active': { transform: 'translateY(2px)', boxShadow: '0 1px 0 transparent' },
      '@media (hover: hover)': {
        '&:hover': {
          borderColor: (theme.vars ?? theme).palette.primary.main,
          backgroundColor: tint(theme.vars!.palette.primary.mainChannel, '0.06'),
        },
      },
    }
  }
}

/** Chunky Duolingo-style call-to-action button. */
function JuicyButton({
  color,
  dark,
  children,
  onClick,
}: {
  color: string
  dark: string
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <Button
      fullWidth
      size="large"
      onClick={onClick}
      sx={{
        bgcolor: color,
        color: '#fff',
        fontWeight: 800,
        fontSize: 16,
        letterSpacing: 0.5,
        borderRadius: 3,
        py: 1.25,
        boxShadow: `0 4px 0 ${dark}`,
        transition: 'transform 80ms, box-shadow 80ms, background-color 120ms',
        '&:hover': { bgcolor: color, filter: 'brightness(1.05)', boxShadow: `0 4px 0 ${dark}` },
        '&:active': { transform: 'translateY(3px)', boxShadow: '0 1px 0 transparent' },
      }}
    >
      {children}
    </Button>
  )
}

function LessonExhibit({ deckId, cardId, exhibit }: { deckId: string; cardId: string; exhibit: Exhibit }) {
  if (exhibit.type === 'cli') return <CliExhibit text={exhibit.text} />
  if (exhibit.type === 'topology') return <TopologyExhibit spec={exhibit.spec} />
  return (
    <Box
      component="img"
      src={imageUrl(deckId, exhibit.src)}
      alt={`Exhibit for ${cardId}`}
      loading="lazy"
      sx={{
        display: 'block',
        maxWidth: '100%',
        maxHeight: 360,
        mx: 'auto',
        my: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: '#fff',
      }}
    />
  )
}

interface Summary {
  stars: 1 | 2 | 3
  xp: number
  firstTryCorrect: number
  total: number
  ms: number
  /** total XP before this lesson, for the level-up animation */
  xpBefore: number
  /** today's XP before this lesson, to detect crossing the daily goal */
  todayBefore: number
}

function DoneScreen({ summary, onContinue }: { summary: Summary; onContinue: () => void }) {
  const [xpShown, setXpShown] = useState(0)
  const before = levelFor(summary.xpBefore)
  const lvl = levelFor(summary.xpBefore + summary.xp)
  const leveled = lvl.level > before.level
  const goalHit = summary.todayBefore < DAILY_GOAL_XP && summary.todayBefore + summary.xp >= DAILY_GOAL_XP
  // the level bar starts at the pre-lesson fill (or empty after a level-up) and fills in
  const [fill, setFill] = useState(leveled ? 0 : before.into / before.needed)

  // star pings timed with the pop-in animation below
  useEffect(() => {
    const ids = Array.from({ length: summary.stars }, (_, i) =>
      setTimeout(() => sfx.star(i), 500 + i * 350),
    )
    if (leveled) ids.push(setTimeout(() => sfx.levelUp(), 1100))
    return () => ids.forEach(clearTimeout)
  }, [summary.stars, leveled])

  useEffect(() => {
    const id = setTimeout(() => setFill(lvl.into / lvl.needed), 800)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (xpShown >= summary.xp) return
    const id = setTimeout(() => setXpShown((v) => v + 1), 40)
    return () => clearTimeout(id)
  }, [xpShown, summary.xp])

  return (
    <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
      <Confetti />
      <Stack direction="row" justifyContent="center" alignItems="flex-end" sx={{ mb: 1 }}>
        {[0, 1, 2].map((i) => (
          <StarRoundedIcon
            key={i}
            sx={{
              fontSize: i === 1 ? 96 : 72,
              mb: i === 1 ? 2 : 0,
              color: i < summary.stars ? GOLD : 'action.disabledBackground',
              filter: i < summary.stars ? 'drop-shadow(0 2px 0 rgba(0,0,0,0.2))' : 'none',
              animation: `${pop} 0.45s ${0.35 + i * 0.35}s cubic-bezier(0.34, 1.56, 0.64, 1) both`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          />
        ))}
      </Stack>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Lesson complete!
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2.5 }}>
        {summary.firstTryCorrect === summary.total
          ? 'Flawless — every answer right on the first try!'
          : `You got ${summary.firstTryCorrect} of ${summary.total} on the first try.`}
      </Typography>

      {leveled && (
        <Box
          sx={{
            display: 'inline-block',
            px: 3,
            py: 1,
            mb: 2.5,
            borderRadius: 3,
            color: '#fff',
            background: `linear-gradient(135deg, ${GOLD}, #ff9600)`,
            boxShadow: '0 4px 0 #cc7800',
            animation: `${pop} 0.5s 1s cubic-bezier(0.34, 1.56, 0.64, 1) both`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <Typography sx={{ fontWeight: 900, letterSpacing: 1.5 }}>LEVEL UP!</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
            You reached level {lvl.level} — {lvl.title}
          </Typography>
        </Box>
      )}

      <Box sx={{ maxWidth: 380, mx: 'auto', mb: 3, textAlign: 'left' }}>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            Level {lvl.level} · {lvl.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {lvl.into}/{lvl.needed} XP
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={fill * 100}
          sx={{
            height: 12,
            borderRadius: 6,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              borderRadius: 6,
              background: `linear-gradient(90deg, ${GOLD}, #ffde59)`,
              transition: 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1)',
            },
          }}
        />
      </Box>

      <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ mb: 2.5 }}>
        {[
          { label: 'XP earned', value: `+${xpShown}`, color: GOLD },
          { label: 'Accuracy', value: formatPercent(summary.firstTryCorrect, summary.total), color: GREEN },
          { label: 'Time', value: formatDuration(summary.ms), color: '#1cb0f6' },
        ].map((t) => (
          <Box
            key={t.label}
            sx={{
              border: '2px solid',
              borderColor: t.color,
              borderRadius: 3,
              px: 2,
              py: 1,
              minWidth: 96,
              boxShadow: `0 3px 0 ${t.color}`,
            }}
          >
            <Typography sx={{ fontWeight: 800, fontSize: 20, color: t.color }}>{t.value}</Typography>
            <Typography variant="caption" color="text.secondary">
              {t.label}
            </Typography>
          </Box>
        ))}
      </Stack>

      {goalHit && (
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          justifyContent="center"
          sx={{
            mb: 2.5,
            color: '#ff9600',
            animation: `${pop} 0.4s 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) both`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <LocalFireDepartmentIcon />
          <Typography sx={{ fontWeight: 800 }}>Daily goal reached — streak extended!</Typography>
        </Stack>
      )}

      <JuicyButton color={GREEN} dark={GREEN_DARK} onClick={onContinue}>
        CONTINUE
      </JuicyButton>
    </Container>
  )
}

function LessonRunner({ deckId, lesson }: { deckId: string; lesson: QuestLesson }) {
  const navigate = useNavigate()
  const [queue, setQueue] = useState<DeckCard[]>(() => shuffle([...lesson.cards]))
  const [pos, setPos] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [firstTry, setFirstTry] = useState<Record<string, boolean>>({})
  const [doneCount, setDoneCount] = useState(0)
  const [combo, setCombo] = useState(0)
  const [praise, setPraise] = useState('')
  const [quitOpen, setQuitOpen] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const startRef = useRef(Date.now())

  const total = lesson.cards.length
  const current = queue[pos]
  const revealed = picked !== null
  const wasCorrect = revealed && picked === current.answer

  const handlePick = (key: string) => {
    if (revealed) return
    setPicked(key)
    const ok = key === current.answer
    if (!(current.id in firstTry)) {
      setFirstTry({ ...firstTry, [current.id]: ok })
      store.recordAnswer(deckId, current.id, ok, 'quest', { lesson: lesson.key })
    }
    if (ok) {
      sfx.correct()
      const streak = combo + 1
      setCombo(streak)
      setDoneCount((d) => d + 1)
      setPraise(streak >= 3 ? `${streak} in a row! 🔥` : PRAISE[Math.floor(Math.random() * PRAISE.length)])
    } else {
      sfx.wrong()
      setCombo(0)
      // Duolingo rule: missed questions come back until answered correctly
      setQueue((q) => [...q, current])
    }
  }

  const handleContinue = () => {
    if (pos + 1 < queue.length) {
      setPos(pos + 1)
      setPicked(null)
      window.scrollTo({ top: 0 })
      return
    }
    const firstTryCorrect = Object.values(firstTry).filter(Boolean).length
    const stars = starsFor(firstTryCorrect, total)
    const xp = lessonXp(firstTryCorrect, total)
    const now = Date.now()
    const snap = questStore.getSnapshot()
    const xpBefore = totalXp(snap)
    const todayBefore = xpToday(snap, now)
    questStore.completeLesson(deckId, lesson.key, stars, xp, now)
    sfx.complete()
    setSummary({ stars, xp, firstTryCorrect, total, ms: now - startRef.current, xpBefore, todayBefore })
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    if (summary) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (picked === null) {
        const byNumber = ['1', '2', '3', '4'].indexOf(e.key)
        const byLetter = current.options.find((o) => o.key === e.key.toUpperCase())
        if (byNumber >= 0 && current.options[byNumber]) handlePick(current.options[byNumber].key)
        else if (byLetter) handlePick(byLetter.key)
      } else if (e.key === ' ' || e.key === 'Enter') {
        handleContinue()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (summary) return <DoneScreen summary={summary} onContinue={() => navigate(`/deck/${deckId}/quest`)} />

  const optionState = (key: string): OptionState => {
    if (!revealed) return 'idle'
    if (key === current.answer) return 'correct'
    if (key === picked) return 'wrong'
    return 'dim'
  }

  return (
    <Container
      maxWidth="md"
      sx={{ py: 2, display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 64px)', pb: revealed ? '45vh' : 4 }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => setQuitOpen(true)} aria-label="quit lesson">
          <CloseIcon />
        </IconButton>
        <LinearProgress
          variant="determinate"
          value={(doneCount / total) * 100}
          sx={{
            flex: 1,
            height: 14,
            borderRadius: 7,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              borderRadius: 7,
              background: `linear-gradient(90deg, ${GREEN}, #8ee000)`,
              '&::after': {
                content: '""',
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: '40%',
                background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent)',
                animation: `${shine} 2.2s ease-in-out infinite`,
              },
            },
            '@media (prefers-reduced-motion: reduce)': { '& .MuiLinearProgress-bar::after': { display: 'none' } },
          }}
        />
        {combo >= 2 && (
          <Stack
            key={combo}
            direction="row"
            alignItems="center"
            spacing={0.25}
            sx={{
              color: '#ff9600',
              animation: `${pop} 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          >
            <LocalFireDepartmentIcon />
            <Typography sx={{ fontWeight: 800 }}>{combo}</Typography>
          </Stack>
        )}
      </Stack>

      <Chip label={current.id} size="small" color="primary" variant="outlined" sx={{ alignSelf: 'flex-start', mb: 1 }} />
      <MarkdownHtml html={current.questionHtml} sx={{ fontSize: '1.1rem', fontWeight: 600 }} />
      {current.exhibits.map((ex, i) => (
        <LessonExhibit key={i} deckId={deckId} cardId={current.id} exhibit={ex} />
      ))}

      <Stack spacing={1.25} sx={{ mt: 2.5 }}>
        {current.options.map((o) => {
          const state = optionState(o.key)
          return (
            // key includes the card id so DOM nodes (and their color transitions)
            // never carry over from the previous question
            <ButtonBase
              key={`${current.id}-${o.key}`}
              disabled={revealed}
              onClick={() => handlePick(o.key)}
              sx={optionSx(state)}
            >
              <Box
                sx={{
                  position: 'relative',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                  bgcolor: state === 'correct' ? GREEN : state === 'wrong' ? RED : 'action.selected',
                  color: state === 'correct' || state === 'wrong' ? '#fff' : 'text.primary',
                }}
              >
                {o.key}
                {state === 'correct' && wasCorrect && <SparkleBurst />}
              </Box>
              <MarkdownHtml html={o.html} sx={{ flex: 1, pt: '3px' }} />
            </ButtonBase>
          )
        })}
      </Stack>

      {revealed && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: (t) => t.zIndex.appBar + 1,
            bgcolor: 'background.paper',
            backgroundImage: wasCorrect
              ? 'linear-gradient(rgba(88, 204, 2, 0.15), rgba(88, 204, 2, 0.15))'
              : 'linear-gradient(rgba(255, 75, 75, 0.12), rgba(255, 75, 75, 0.12))',
            borderTop: '2px solid',
            borderColor: wasCorrect ? GREEN : RED,
            animation: `${slideUp} 0.25s ease-out`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            pb: 'calc(env(safe-area-inset-bottom) + 12px)',
          }}
        >
          <Container maxWidth="md" sx={{ pt: 2 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              {wasCorrect ? (
                <CheckCircleIcon sx={{ fontSize: 38, color: GREEN }} />
              ) : (
                <CancelIcon sx={{ fontSize: 38, color: RED }} />
              )}
              <Typography variant="h6" sx={{ fontWeight: 800, color: wasCorrect ? 'success.main' : 'error.main' }}>
                {wasCorrect ? praise : `Correct answer: ${current.answer}`}
              </Typography>
            </Stack>
            <Box sx={{ maxHeight: '24vh', overflowY: 'auto', mb: 1.5 }}>
              <MarkdownHtml html={current.explanationHtml} sx={{ color: 'text.secondary', fontSize: 14 }} />
            </Box>
            <JuicyButton
              color={wasCorrect ? GREEN : RED}
              dark={wasCorrect ? GREEN_DARK : RED_DARK}
              onClick={handleContinue}
            >
              {wasCorrect ? 'CONTINUE' : 'GOT IT'}
            </JuicyButton>
          </Container>
        </Box>
      )}

      <ConfirmDialog
        open={quitOpen}
        title="Quit this lesson?"
        message="Your progress in this lesson will be lost — completed lessons and XP are kept."
        confirmLabel="Quit lesson"
        onClose={() => setQuitOpen(false)}
        onConfirm={() => navigate(`/deck/${deckId}/quest`)}
      />
    </Container>
  )
}

export default function QuestLessonPage() {
  const { deckId = '', unit = '', lesson = '' } = useParams()
  const { deck, error } = useDeck(deckId)
  const units = useMemo(() => (deck ? buildQuest(deck) : null), [deck])

  if (error) return <ErrorState message={error} />
  if (!deck || !units) return <Loading />

  const u = units.find((x) => x.module === Number(unit))
  const l = u?.lessons[Number(lesson)]
  if (!l) return <ErrorState message="Lesson not found." />

  return <LessonRunner key={`${deckId}:${l.key}`} deckId={deckId} lesson={l} />
}
