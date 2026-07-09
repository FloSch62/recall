import { useEffect, useMemo, useState } from 'react'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { useColorScheme } from '@mui/material/styles'
import { BarChart } from '@mui/x-charts/BarChart'
import { getDeck, useDeckIndex } from '../lib/decks'
import { useProgress } from '../lib/store'
import { bestStreak, buildQuest, deckQuestTotals, levelFor, totalXp, useQuest } from '../lib/quest'
import { DAY_MS, MATURE_IVL, startOfToday, todayKey } from '../lib/srs'
import { moduleCounts } from '../lib/stats'
import { formatPercent } from '../lib/format'
import type { Deck } from '../lib/types'
import { ErrorState, Loading } from '../components/Feedback'

// Palette validated with the dataviz six-checks validator (light & dark surfaces).
const CHART_COLORS = {
  light: {
    correct: '#1baf7a',
    wrong: '#e34948',
    noAnswer: '#8a8987',
    forecast: '#2a78d6',
    states: { new: '#2a78d6', learning: '#eda100', young: '#1baf7a', mature: '#008300' },
  },
  dark: {
    correct: '#199e70',
    wrong: '#e66767',
    noAnswer: '#8a8987',
    forecast: '#3987e5',
    states: { new: '#3987e5', learning: '#c98500', young: '#199e70', mature: '#008300' },
  },
}

function StatTile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="h5">{value}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.8 }}>
            {hint}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

function StateBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((a, b) => a + b.value, 0)
  if (total === 0) return <Typography color="text.secondary">No cards yet.</Typography>
  return (
    <>
      <Box sx={{ display: 'flex', gap: '2px', height: 14, borderRadius: '7px', overflow: 'hidden', mb: 1.5 }}>
        {items
          .filter((i) => i.value > 0)
          .map((i) => (
            <Box key={i.label} sx={{ width: `${(i.value / total) * 100}%`, bgcolor: i.color, minWidth: 4 }} />
          ))}
      </Box>
      <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
        {items.map((i) => (
          <Stack key={i.label} direction="row" alignItems="center" spacing={0.75}>
            <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: i.color, flexShrink: 0 }} />
            <Typography variant="caption">
              {i.label} {i.value} ({formatPercent(i.value, total)})
            </Typography>
          </Stack>
        ))}
      </Stack>
    </>
  )
}

export default function StatsPage() {
  const { index, error } = useDeckIndex()
  const data = useProgress()
  const quest = useQuest()
  const { mode, systemMode } = useColorScheme()
  const dark = (mode === 'system' ? systemMode : mode) === 'dark'
  const C = dark ? CHART_COLORS.dark : CHART_COLORS.light

  const [decks, setDecks] = useState<Deck[] | null>(null)
  useEffect(() => {
    if (!index) return
    let cancelled = false
    Promise.all(index.decks.map((d) => getDeck(d.id))).then(
      (ds) => {
        if (!cancelled) setDecks(ds)
      },
      () => {
        if (!cancelled) setDecks([])
      },
    )
    return () => {
      cancelled = true
    }
  }, [index])

  const now = Date.now()
  const sod = startOfToday(now)

  const computed = useMemo(() => {
    const activityLog = data.log
    const attempts = activityLog.filter((l) => l.correct !== null)
    const correctAll = attempts.filter((l) => l.correct === true).length

    // streak
    const days = new Set(activityLog.map((l) => todayKey(l.t)))
    let streak = 0
    const cursor = new Date(now)
    if (!days.has(todayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
    while (days.has(todayKey(cursor.getTime()))) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }

    // last 30 days, stacked by answer result
    const labels: string[] = []
    const correct: number[] = new Array(30).fill(0)
    const wrong: number[] = new Array(30).fill(0)
    const noAnswer: number[] = new Array(30).fill(0)
    const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
    const dayIndex = new Map<string, number>()
    for (let i = 0; i < 30; i++) {
      const t = sod - (29 - i) * DAY_MS
      labels.push(fmt.format(t))
      dayIndex.set(todayKey(t), i)
    }
    for (const l of activityLog) {
      const i = dayIndex.get(todayKey(l.t))
      if (i === undefined) continue
      if (l.correct === true) correct[i]++
      else if (l.correct === false) wrong[i]++
      else noAnswer[i]++
    }
    const activity30 = correct.reduce((a, b) => a + b, 0) + wrong.reduce((a, b) => a + b, 0) + noAnswer.reduce((a, b) => a + b, 0)

    // 14-day due forecast (overdue folds into today)
    const forecastLabels: string[] = []
    const forecast: number[] = new Array(14).fill(0)
    for (let i = 0; i < 14; i++) {
      forecastLabels.push(i === 0 ? 'Today' : fmt.format(sod + i * DAY_MS))
    }
    let learning = 0
    let young = 0
    let mature = 0
    let started = 0
    for (const p of Object.values(data.cards)) {
      if (p.st === 'new') continue
      started++
      if (p.st === 'learning' || p.st === 'relearning') learning++
      else if (p.ivl >= MATURE_IVL) mature++
      else young++
      // overdue and today fold into slot 0; beyond 14 days clamps to the last slot
      const idx = p.due < sod + DAY_MS ? 0 : Math.min(13, Math.floor((p.due - sod) / DAY_MS))
      forecast[idx]++
    }

    return {
      streak,
      totalActivity: activityLog.length,
      activity30,
      attempts: attempts.length,
      correctAll,
      labels,
      correct,
      wrong,
      noAnswer,
      forecastLabels,
      forecast,
      learning,
      young,
      mature,
      started,
    }
  }, [data, sod, now])

  const questSummary = useMemo(() => {
    let total = 0
    let done = 0
    let perfect = 0
    for (const deck of decks ?? []) {
      const lessons = buildQuest(deck).flatMap((u) => u.lessons)
      const totals = deckQuestTotals(quest, deck.id, lessons)
      total += lessons.length
      done += totals.done
      perfect += totals.perfect
    }
    const xp = totalXp(quest)
    return { xp, level: levelFor(xp), total, done, perfect, bestStreak: bestStreak(quest) }
  }, [decks, quest])

  if (error) return <ErrorState message={error} />
  if (!index) return <Loading />

  const totalCards = index.decks.reduce((a, d) => a + d.cardCount, 0)
  const newCount = Math.max(0, totalCards - computed.started)
  const hasAny = computed.totalActivity > 0 || computed.attempts > 0 || questSummary.xp > 0

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Statistics
      </Typography>

      {!hasAny && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography color="text.secondary">
              No study activity yet — stats appear after your first answer.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatTile value={`${computed.streak}d`} label="Activity streak" hint={computed.streak > 0 ? 'keep it going' : undefined} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatTile value={String(computed.totalActivity)} label="Activity" hint={`${computed.activity30} in last 30 days`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatTile
            value={formatPercent(computed.correctAll, computed.attempts)}
            label="Answer accuracy"
            hint={`${computed.attempts} answers`}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatTile value={`${computed.mature}/${totalCards}`} label="Mastered" hint={`interval ≥ ${MATURE_IVL}d`} />
        </Grid>
      </Grid>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Quest progress
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatTile
            value={`Level ${questSummary.level.level}`}
            label={questSummary.level.title}
            hint={`${questSummary.xp} XP`}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatTile value={`${questSummary.done}/${questSummary.total}`} label="Lessons" />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatTile value={String(questSummary.perfect)} label="Perfect lessons" />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatTile value={`${questSummary.bestStreak}d`} label="Best Quest streak" />
        </Grid>
      </Grid>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Activity per day — last 30 days
          </Typography>
          <BarChart
            height={260}
            xAxis={[
              {
                scaleType: 'band',
                data: computed.labels,
                tickLabelInterval: (_v, i) => i % 5 === 4,
                tickLabelStyle: { fontSize: 11 },
              },
            ]}
            series={[
              { data: computed.correct, label: 'Correct', stack: 'activity', color: C.correct },
              { data: computed.wrong, label: 'Incorrect', stack: 'activity', color: C.wrong },
              { data: computed.noAnswer, label: 'No answer', stack: 'activity', color: C.noAnswer },
            ]}
            grid={{ horizontal: true }}
            borderRadius={3}
            margin={{ top: 10 }}
          />
        </CardContent>
      </Card>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Due forecast — next 14 days
              </Typography>
              <BarChart
                height={220}
                xAxis={[
                  {
                    scaleType: 'band',
                    data: computed.forecastLabels,
                    tickLabelInterval: (_v, i) => i % 2 === 0,
                    tickLabelStyle: { fontSize: 11 },
                  },
                ]}
                series={[{ data: computed.forecast, label: 'Cards due', color: C.forecast }]}
                grid={{ horizontal: true }}
                borderRadius={3}
                hideLegend
                margin={{ top: 10 }}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                Card states
              </Typography>
              <StateBar
                items={[
                  { label: 'New', value: newCount, color: C.states.new },
                  { label: 'Learning', value: computed.learning, color: C.states.learning },
                  { label: 'Young', value: computed.young, color: C.states.young },
                  { label: 'Mature', value: computed.mature, color: C.states.mature },
                ]}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {decks?.map((deck) => (
        <DeckModuleTable key={deck.id} deck={deck} />
      ))}
    </Container>
  )
}

function DeckModuleTable({ deck }: { deck: Deck }) {
  const data = useProgress()
  const modules = useMemo(() => moduleCounts(deck, data), [deck, data])
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {deck.title}
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow>
                <TableCell>Module</TableCell>
                <TableCell align="right">Cards</TableCell>
                <TableCell align="right">Answered</TableCell>
                <TableCell align="right">In SRS</TableCell>
                <TableCell align="right">Mastered</TableCell>
                <TableCell align="right">Accuracy</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {deck.modules.map((title, i) => {
                const m = modules[i]
                return (
                  <TableRow key={title}>
                    <TableCell>{title}</TableCell>
                    <TableCell align="right">{m.total}</TableCell>
                    <TableCell align="right">{m.answered}</TableCell>
                    <TableCell align="right">{m.started}</TableCell>
                    <TableCell align="right">{m.mature}</TableCell>
                    <TableCell align="right">{formatPercent(m.correct, m.seen)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  )
}
