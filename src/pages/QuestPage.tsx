import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { keyframes } from '@emotion/react'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Collapse from '@mui/material/Collapse'
import Grid from '@mui/material/Grid'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import ButtonBase from '@mui/material/ButtonBase'
import Snackbar from '@mui/material/Snackbar'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import BoltIcon from '@mui/icons-material/Bolt'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import LockIcon from '@mui/icons-material/Lock'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded'
import { useDeck } from '../lib/decks'
import { useProgress } from '../lib/store'
import {
  DAILY_GOAL_XP,
  bestStreak,
  buildQuest,
  deckQuestTotals,
  lastDaysXp,
  lessonScore,
  levelFor,
  questStore,
  questStreak,
  questStepIsComplete,
  totalXp,
  useQuest,
  xpToday,
  type DayXp,
} from '../lib/quest'
import { deckCounts, sessionEstimate } from '../lib/stats'
import { sfx } from '../lib/sounds'
import Confetti from '../components/Confetti'
import Ring from '../components/Ring'
import { ErrorState, Loading } from '../components/Feedback'

export const UNIT_COLORS = [
  { main: '#58cc02', dark: '#46a302' },
  { main: '#1cb0f6', dark: '#1899d6' },
  { main: '#ce82ff', dark: '#a568cc' },
  { main: '#ff9600', dark: '#cc7800' },
  { main: '#ff86d0', dark: '#cc6ba6' },
  { main: '#00cd9c', dark: '#00a47d' },
]

const GOLD = '#ffc800'

// per-color pulse: keep the 3D shadow while the halo expands and fades
const pulses = UNIT_COLORS.map(
  (c) => keyframes`
    0% { box-shadow: 0 6px 0 ${c.dark}, 0 0 0 0 ${c.main}66; }
    70% { box-shadow: 0 6px 0 ${c.dark}, 0 0 0 16px transparent; }
    100% { box-shadow: 0 6px 0 ${c.dark}, 0 0 0 0 transparent; }
  `,
)

const bounce = keyframes`
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, -7px); }
`

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
`

/** Horizontal snake offsets, cycled by global node index. */
const OFFSETS = [0, 44, 70, 44, 0, -44, -70, -44]

/** Dotted path segment between two nodes of the snake. */
function PathDots({ from, to }: { from: number; to: number }) {
  return (
    <Box aria-hidden sx={{ position: 'relative', height: 26, width: '100%' }}>
      {[0.25, 0.5, 0.75].map((t, i) => (
        <Box
          key={t}
          sx={{
            position: 'absolute',
            top: i * 9,
            left: '50%',
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'action.disabled',
            transform: `translateX(calc(${from + (to - from) * t}px - 50%))`,
          }}
        />
      ))}
    </Box>
  )
}

interface NodeProps {
  state: 'done' | 'active' | 'locked'
  kind: 'lesson' | 'checkpoint'
  colorIdx: number
  stars?: number
  offset: number
  label: string
  nodeRef?: React.Ref<HTMLButtonElement>
  onClick: () => void
}

function PathNode({ state, kind, colorIdx, stars, offset, label, nodeRef, onClick }: NodeProps) {
  const color = UNIT_COLORS[colorIdx]
  const locked = state === 'locked'
  const perfect = kind === 'lesson' && state === 'done' && stars === 3
  const restShadow = locked
    ? '0 6px 0 rgba(128, 128, 128, 0.35)'
    : perfect
      ? `0 6px 0 ${color.dark}, 0 0 0 3px ${GOLD}aa`
      : `0 6px 0 ${color.dark}`
  return (
    <Box sx={{ position: 'relative', my: 0.75, transform: `translateX(${offset}px)` }}>
      {state === 'active' && (
        <Box
          sx={{
            position: 'absolute',
            top: -44,
            left: '50%',
            zIndex: 1,
            animation: `${bounce} 1.1s ease-in-out infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none', transform: 'translate(-50%, 0)' },
          }}
        >
          <Box
            sx={{
              bgcolor: 'background.paper',
              border: '2px solid',
              borderColor: 'divider',
              borderRadius: 3,
              px: 1.5,
              py: 0.5,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: 1,
              color: color.main,
              whiteSpace: 'nowrap',
            }}
          >
            START
          </Box>
        </Box>
      )}
      <ButtonBase
        ref={nodeRef}
        onClick={onClick}
        aria-label={label}
        sx={{
          width: 72,
          height: 72,
          borderRadius: kind === 'checkpoint' ? 3 : '50%',
          color: '#fff',
          bgcolor: locked ? 'action.disabledBackground' : color.main,
          boxShadow: restShadow,
          transition: 'transform 80ms, box-shadow 80ms',
          '&:active': {
            transform: 'translateY(4px)',
            boxShadow: locked ? '0 2px 0 rgba(128, 128, 128, 0.35)' : `0 2px 0 ${color.dark}`,
          },
          animation: state === 'active' ? `${pulses[colorIdx]} 1.8s ease-out infinite` : undefined,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        {locked ? (
          <LockIcon sx={{ color: 'text.disabled', fontSize: 30 }} />
        ) : kind === 'checkpoint' ? (
          <LightbulbRoundedIcon sx={{ fontSize: 38 }} />
        ) : state === 'done' ? (
          <CheckRoundedIcon sx={{ fontSize: 40 }} />
        ) : (
          <StarRoundedIcon sx={{ fontSize: 44 }} />
        )}
      </ButtonBase>
      {state === 'done' && kind === 'checkpoint' && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            right: -7,
            bottom: -9,
            zIndex: 1,
            width: 25,
            height: 25,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'background.paper',
            color: color.main,
            border: '2px solid',
            borderColor: color.main,
            boxShadow: '0 2px 0 rgba(0,0,0,0.14)',
          }}
        >
          <CheckRoundedIcon sx={{ fontSize: 18 }} />
        </Box>
      )}
      {state === 'done' && kind === 'lesson' && (
        <Stack
          direction="row"
          sx={{ position: 'absolute', bottom: -12, left: '50%', transform: 'translateX(-50%)' }}
        >
          {[0, 1, 2].map((i) => (
            <StarRoundedIcon
              key={i}
              sx={{
                fontSize: 18,
                color: i < (stars ?? 0) ? GOLD : 'action.disabled',
                filter: i < (stars ?? 0) ? 'drop-shadow(0 1px 0 rgba(0,0,0,0.25))' : 'none',
              }}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}

/** Last-7-days XP bars with the daily-goal line. */
function WeekChart({ days }: { days: DayXp[] }) {
  const H = 72
  const max = Math.max(DAILY_GOAL_XP, ...days.map((d) => d.xp))
  const goalBottom = 20 + (DAILY_GOAL_XP / max) * H
  return (
    <Box sx={{ position: 'relative', pr: 4.5 }}>
      <Box
        aria-hidden
        sx={{ position: 'absolute', left: 0, right: 36, bottom: goalBottom, borderTop: '2px dashed', borderColor: 'divider' }}
      />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ position: 'absolute', right: 0, bottom: goalBottom - 8, fontSize: 10, lineHeight: 1 }}
      >
        goal
      </Typography>
      <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ height: H }}>
        {days.map((d) => (
          <Box
            key={d.key}
            title={`${d.xp} XP`}
            aria-label={`${d.key}: ${d.xp} XP`}
            sx={{
              flex: 1,
              height: Math.max(4, (d.xp / max) * H),
              borderRadius: '4px 4px 0 0',
              bgcolor: d.xp >= DAILY_GOAL_XP ? '#58cc02' : d.xp > 0 ? 'rgba(88, 204, 2, 0.45)' : 'action.disabledBackground',
              position: 'relative',
            }}
          >
            {d.isToday && d.xp > 0 && (
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  top: -18,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontWeight: 700,
                  fontSize: 11,
                  color: 'text.secondary',
                }}
              >
                {d.xp}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        {days.map((d) => (
          <Typography
            key={d.key}
            variant="caption"
            sx={{
              flex: 1,
              textAlign: 'center',
              fontWeight: d.isToday ? 800 : 400,
              color: d.isToday ? 'text.primary' : 'text.secondary',
            }}
          >
            {d.label}
          </Typography>
        ))}
      </Stack>
    </Box>
  )
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, px: 1.5, py: 1, textAlign: 'center' }}>
      <Typography sx={{ fontWeight: 800, fontSize: 18 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  )
}

export default function QuestPage() {
  const { deckId = '' } = useParams()
  const { deck, error } = useDeck(deckId)
  const navigate = useNavigate()
  const data = useQuest()
  const progress = useProgress()
  const [lockedOpen, setLockedOpen] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const activeRef = useRef<HTMLButtonElement | null>(null)

  const units = useMemo(() => (deck ? buildQuest(deck) : []), [deck])

  useEffect(() => {
    if (deck) activeRef.current?.scrollIntoView({ block: 'center' })
  }, [deck])

  useEffect(() => {
    if (!celebrate) return
    const id = setTimeout(() => setCelebrate(false), 4500)
    return () => clearTimeout(id)
  }, [celebrate])

  if (error) return <ErrorState message={error} />
  if (!deck) return <Loading />

  const flat = units.flatMap((u) => u.lessons)
  const flatSteps = units.flatMap((u) => u.steps)
  const firstOpen = flatSteps.findIndex((step) => !questStepIsComplete(data, deckId, step))
  const allDone = firstOpen === -1
  const now = Date.now()
  const streak = questStreak(data, now)
  const xp = totalXp(data)
  const lvl = levelFor(xp)
  const xpT = xpToday(data, now)
  const goalMet = xpT >= DAILY_GOAL_XP
  const totals = deckQuestTotals(data, deckId, flat)
  const week = lastDaysXp(data, now, 7)
  const srsCounts = deckCounts(deck, progress, now)
  const srsDue = srsCounts.dueReviews + srsCounts.dueLearning
  const srsEstimate = sessionEstimate(srsCounts, progress, deckId, now)

  // global node index per unit so the snake continues across unit banners
  const unitStart: number[] = []
  let acc = 0
  for (const u of units) {
    unitStart.push(acc)
    acc += u.steps.length
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      {celebrate && <Confetti />}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <IconButton onClick={() => navigate(`/deck/${deckId}`)} aria-label="back to deck">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ flex: 1, minWidth: 0 }} noWrap>
          {deck.title}
        </Typography>
        <IconButton
          aria-label={data.sound ? 'mute sounds' : 'unmute sounds'}
          onClick={() => {
            questStore.setSound(!data.sound)
            if (!data.sound) sfx.tap()
          }}
        >
          {data.sound ? <VolumeUpIcon /> : <VolumeOffIcon />}
        </IconButton>
      </Stack>

      <Box
        sx={{
          borderRadius: 4,
          p: 2,
          mb: 1.5,
          color: '#fff',
          background: 'linear-gradient(135deg, #58cc02 0%, #1cb0f6 100%)',
          boxShadow: '0 4px 0 rgba(0, 0, 0, 0.18)',
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Ring size={72} stroke={6} progress={lvl.into / lvl.needed} color="#fff">
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 900, fontSize: 24, lineHeight: 1 }}>{lvl.level}</Typography>
              <Typography sx={{ fontSize: 9, letterSpacing: 1, opacity: 0.9 }}>LEVEL</Typography>
            </Box>
          </Ring>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>{lvl.title}</Typography>
            <Typography sx={{ fontSize: 13, opacity: 0.9 }}>
              {lvl.needed - lvl.into} XP to level {lvl.level + 1}
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 0.75, flexWrap: 'wrap', rowGap: 0.25 }}>
              <Stack direction="row" spacing={0.25} alignItems="center">
                <LocalFireDepartmentIcon sx={{ fontSize: 18 }} />
                <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{streak}d</Typography>
              </Stack>
              <Stack direction="row" spacing={0.25} alignItems="center">
                <BoltIcon sx={{ fontSize: 18 }} />
                <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{xp} XP</Typography>
              </Stack>
              <Typography sx={{ fontWeight: 700, fontSize: 13, opacity: 0.9 }}>
                {totals.done}/{flat.length} lessons
              </Typography>
            </Stack>
          </Box>
          <Ring size={64} stroke={6} progress={xpT / DAILY_GOAL_XP} color={GOLD}>
            <Box sx={{ textAlign: 'center' }}>
              {goalMet ? (
                <LocalFireDepartmentIcon sx={{ color: GOLD, fontSize: 26 }} />
              ) : (
                <>
                  <Typography sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1 }}>{xpT}</Typography>
                  <Typography sx={{ fontSize: 8, opacity: 0.9 }}>of {DAILY_GOAL_XP}</Typography>
                </>
              )}
            </Box>
          </Ring>
        </Stack>
      </Box>

      <Button
        size="small"
        color="inherit"
        onClick={() => setStatsOpen((o) => !o)}
        endIcon={
          <ExpandMoreIcon sx={{ transform: statsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
        }
        sx={{ color: 'text.secondary', mb: 0.5 }}
      >
        {statsOpen ? 'Hide stats' : 'Stats'}
      </Button>

      <Collapse in={statsOpen}>
        <Card sx={{ mb: 1.5 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              XP this week
            </Typography>
            <WeekChart days={week} />
            <Grid container spacing={1} sx={{ mt: 1.5 }}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatTile value={`${totals.done}/${flat.length}`} label="Lessons" />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatTile value={`${totals.perfect}`} label="Perfect" />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatTile value={`${totals.stars}/${flat.length * 3}`} label="Stars" />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatTile value={`${bestStreak(data)}d`} label="Best streak" />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <StatTile value={`${srsDue}`} label="SRS due" />
              </Grid>
            </Grid>
            {srsDue > 0 && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<PlayArrowIcon />}
                onClick={() => navigate(`/deck/${deckId}/study`)}
                sx={{ mt: 1.5 }}
              >
                Study{srsEstimate > 0 ? ` (${srsEstimate})` : ''}
              </Button>
            )}
          </CardContent>
        </Card>
      </Collapse>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pb: 6 }}>
        {units.map((u, ui) => {
          const color = UNIT_COLORS[ui % UNIT_COLORS.length]
          return (
            <Box key={u.module} sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box
                sx={{
                  width: '100%',
                  borderRadius: 4,
                  px: 2.5,
                  py: 1.75,
                  mt: 2.5,
                  mb: 3.5,
                  color: '#fff',
                  bgcolor: color.main,
                  boxShadow: `0 4px 0 ${color.dark}`,
                }}
              >
                <Typography sx={{ fontWeight: 800, opacity: 0.85, fontSize: 12, letterSpacing: 1.5 }}>
                  UNIT {ui + 1}
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: 17 }}>{u.title}</Typography>
              </Box>
              {u.steps.map((step, si) => {
                const gi = unitStart[ui] + si
                const score = step.type === 'lesson' ? lessonScore(data, deckId, step.key) : undefined
                const complete = questStepIsComplete(data, deckId, step)
                const state: NodeProps['state'] = complete ? 'done' : gi === firstOpen ? 'active' : 'locked'
                const label =
                  step.type === 'lesson'
                    ? `${u.title} — lesson ${step.index + 1} (${step.cards.length} questions)`
                    : `${u.title} — checkpoint: ${step.checkpoint.title}`
                return (
                  <Box
                    key={step.key}
                    sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  >
                    {si > 0 && <PathDots from={OFFSETS[(gi - 1) % OFFSETS.length]} to={OFFSETS[gi % OFFSETS.length]} />}
                    <PathNode
                      state={state}
                      kind={step.type}
                      colorIdx={ui % UNIT_COLORS.length}
                      stars={score?.stars}
                      offset={OFFSETS[gi % OFFSETS.length]}
                      label={label}
                      nodeRef={state === 'active' ? activeRef : undefined}
                      onClick={() => {
                        if (state === 'locked') {
                          setLockedOpen(true)
                          return
                        }
                        sfx.tap()
                        navigate(
                          step.type === 'lesson'
                            ? `/deck/${deckId}/quest/${u.module}/${step.index}`
                            : `/deck/${deckId}/quest/checkpoint/${encodeURIComponent(step.checkpoint.id)}`,
                        )
                      }}
                    />
                  </Box>
                )
              })}
            </Box>
          )
        })}

        {flat.length > 0 && (
          <PathDots from={OFFSETS[(acc - 1) % OFFSETS.length]} to={OFFSETS[acc % OFFSETS.length]} />
        )}
        <Box
          sx={{
            position: 'relative',
            my: 0.75,
            transform: `translateX(${OFFSETS[acc % OFFSETS.length]}px)`,
            animation: allDone ? `${float} 2.2s ease-in-out infinite` : undefined,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <ButtonBase
            aria-label={allDone ? 'quest complete!' : 'finish all lessons to earn the trophy'}
            onClick={() => {
              if (!allDone) {
                setLockedOpen(true)
                return
              }
              sfx.complete()
              setCelebrate(true)
            }}
            sx={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              bgcolor: allDone ? GOLD : 'action.disabledBackground',
              boxShadow: allDone ? '0 6px 0 #e6a800' : '0 6px 0 rgba(128, 128, 128, 0.35)',
              transition: 'transform 80ms, box-shadow 80ms',
              '&:active': { transform: 'translateY(4px)', boxShadow: allDone ? '0 2px 0 #e6a800' : undefined },
            }}
          >
            <EmojiEventsIcon sx={{ fontSize: 46, color: allDone ? '#fff' : 'text.disabled' }} />
          </ButtonBase>
        </Box>
      </Box>

      <Snackbar
        open={lockedOpen}
        autoHideDuration={2500}
        onClose={() => setLockedOpen(false)}
        message="Complete the previous path step to unlock this one!"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Container>
  )
}
