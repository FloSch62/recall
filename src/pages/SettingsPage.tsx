import { useRef, useState } from 'react'
import Container from '@mui/material/Container'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Snackbar from '@mui/material/Snackbar'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness'
import { useColorScheme } from '@mui/material/styles'
import { store, useProgress, DEFAULT_SETTINGS, emptyData } from '../lib/store'
import { emptyQuest, mergeQuest, questStore, useQuest } from '../lib/quest'
import { exportProgress, mergeProgress, summarizeImport, type ImportFile, type ImportSummary } from '../lib/importExport'
import { ConfirmDialog } from '../components/Feedback'

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 2 }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const data = useProgress()
  const quest = useQuest()
  const { mode, setMode } = useColorScheme()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<{ file: ImportFile; summary: ImportSummary } | null>(null)
  const [snack, setSnack] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await file.text()
      setPendingImport(summarizeImport(text))
    } catch (e) {
      setSnack(e instanceof Error ? e.message : 'Could not read the file.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const applyImport = (mode: 'merge' | 'replace') => {
    if (!pendingImport) return
    const incoming = pendingImport.file.data
    const incomingQuest = pendingImport.file.quest
    if (mode === 'merge') {
      store.replaceData(mergeProgress(store.getSnapshot(), incoming))
      if (incomingQuest) questStore.replaceData(mergeQuest(questStore.getSnapshot(), incomingQuest))
    } else {
      store.replaceData({
        ...emptyData(),
        ...incoming,
        settings: { ...DEFAULT_SETTINGS, ...incoming.settings },
      })
      questStore.replaceData(incomingQuest ?? emptyQuest())
    }
    setPendingImport(null)
    setSnack(mode === 'merge' ? 'Progress merged.' : 'Progress replaced.')
  }

  const numField = (key: 'newPerDay' | 'maxReviewsPerDay', label: string, help: string, max: number) => (
    <TextField
      label={label}
      type="number"
      size="small"
      value={data.settings[key]}
      onChange={(e) => {
        const v = Math.max(0, Math.min(max, Number(e.target.value) || 0))
        store.setSettings({ [key]: v })
      }}
      helperText={help}
      slotProps={{ htmlInput: { min: 0, max, inputMode: 'numeric' } }}
      sx={{ maxWidth: 260 }}
    />
  )

  const storageKb = Math.max(1, Math.round(JSON.stringify({ data, quest }).length / 1024))

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Settings
      </Typography>
      <Stack spacing={2}>
        <SettingsSection title="Appearance">
          <ToggleButtonGroup
            exclusive
            value={mode ?? 'system'}
            onChange={(_, v: 'light' | 'system' | 'dark' | null) => {
              if (v) setMode(v)
            }}
          >
            <ToggleButton value="light">
              <LightModeIcon sx={{ mr: 1 }} fontSize="small" /> Light
            </ToggleButton>
            <ToggleButton value="system">
              <SettingsBrightnessIcon sx={{ mr: 1 }} fontSize="small" /> System
            </ToggleButton>
            <ToggleButton value="dark">
              <DarkModeIcon sx={{ mr: 1 }} fontSize="small" /> Dark
            </ToggleButton>
          </ToggleButtonGroup>
        </SettingsSection>

        <SettingsSection title="Study limits">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {numField('newPerDay', 'New cards per day', 'Fresh questions introduced per deck per day', 500)}
            {numField('maxReviewsPerDay', 'Max reviews per day', 'Upper bound on due reviews per deck per day', 2000)}
          </Stack>
        </SettingsSection>

        <SettingsSection title="Progress data">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your progress lives in this browser ({storageKb} KB, {data.log.length} activity entries). Export it as a
            JSON file for backup or to move between devices, then import it on the other side.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button variant="contained" startIcon={<FileDownloadIcon />} onClick={() => exportProgress(data, quest)}>
              Export progress
            </Button>
            <Button variant="outlined" startIcon={<FileUploadIcon />} onClick={() => fileRef.current?.click()}>
              Import progress
            </Button>
          </Stack>
          <Box
            component="input"
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => void handleFile(e.target.files?.[0])}
            sx={{ display: 'none' }}
          />
        </SettingsSection>

        <SettingsSection title="Danger zone">
          <Button color="error" variant="outlined" startIcon={<DeleteForeverIcon />} onClick={() => setResetOpen(true)}>
            Reset all progress
          </Button>
        </SettingsSection>

        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          Recall v0.1.0 · decks are plain markdown in public/decks/ · progress is stored locally and never leaves
          your device unless you export it.
        </Typography>
      </Stack>

      <Dialog open={!!pendingImport} onClose={() => setPendingImport(null)}>
        <DialogTitle>Import progress</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography variant="body2" sx={{ mb: 1 }}>
              The file contains <b>{pendingImport?.summary.cards}</b> tracked cards and{' '}
              <b>{pendingImport?.summary.reviews}</b> activity entries
              {pendingImport && (pendingImport.summary.questLessons || pendingImport.summary.questCheckpoints)
                ? `, plus ${pendingImport.summary.questLessons} completed Quest lessons, ${pendingImport.summary.questCheckpoints} reading checkpoints and ${pendingImport.summary.questXp} XP`
                : ''}
              {pendingImport?.summary.exportedAt
                ? `, exported ${new Date(pendingImport.summary.exportedAt).toLocaleString()}`
                : ''}
              .
            </Typography>
            <Alert severity="info" sx={{ mb: 0.5 }}>
              <b>Merge</b> keeps the most-studied version of every card and combines activity history — safe for syncing
              two devices. <b>Replace</b> discards everything currently on this device.
            </Alert>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingImport(null)}>Cancel</Button>
          <Button color="error" onClick={() => applyImport('replace')}>
            Replace
          </Button>
          <Button variant="contained" onClick={() => applyImport('merge')}>
            Merge
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={resetOpen}
        title="Reset all progress?"
        message="This permanently deletes every answer, review schedule, Quest lesson and statistic on this device. Export your progress first if you might want it back."
        confirmLabel="Delete everything"
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          store.resetAll()
          questStore.resetAll()
          setSnack('All progress deleted.')
        }}
      />

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Container>
  )
}
