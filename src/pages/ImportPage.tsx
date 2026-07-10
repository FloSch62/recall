import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Container from '@mui/material/Container'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import GitHubIcon from '@mui/icons-material/GitHub'
import LinkIcon from '@mui/icons-material/Link'
import EditNoteIcon from '@mui/icons-material/EditNote'
import DownloadDoneIcon from '@mui/icons-material/DownloadDone'
import { useDeckIndex } from '../lib/decks'
import { saveImportedDeck, useImportedDecks } from '../lib/importedDecks'
import { deckFromText, importFromGithub, importFromUrl, type PreparedImport } from '../lib/importSource'
import { slugify } from '../lib/parseDeckMd'
import { stripHtml } from '../lib/format'

type Mode = 'manual' | 'github' | 'url'

function DeckPreview({ prepared, onDone }: { prepared: PreparedImport; onDone: (id: string) => void }) {
  const { deck, problems, source } = prepared
  const [id, setId] = useState(deck.id)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { index } = useDeckIndex()
  const imported = useImportedDecks()

  const cleanId = slugify(id)
  const builtinIds = useMemo(
    () => new Set((index?.decks ?? []).filter((d) => d.origin !== 'imported').map((d) => d.id)),
    [index],
  )
  const importedIds = useMemo(() => new Set(imported.summaries.map((s) => s.id)), [imported])

  const idError = !cleanId
    ? 'Deck ID must contain at least one letter or number.'
    : builtinIds.has(cleanId)
      ? 'This ID belongs to a built-in deck — choose another.'
      : null
  const replaces = !idError && importedIds.has(cleanId)
  const exhibitCount = deck.cards.filter((c) => c.exhibits.length > 0).length
  const imageCount = deck.cards.filter((c) => c.exhibits.some((e) => e.type === 'image')).length

  const doImport = async () => {
    if (idError) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveImportedDeck({ ...deck, id: cleanId }, source)
      onDone(cleanId)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not store the deck.')
      setSaving(false)
    }
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
          Preview
        </Typography>
        <Typography variant="h6">{deck.title}</Typography>
        {deck.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {stripHtml(deck.description)}
          </Typography>
        )}
        <Stack direction="row" spacing={1} sx={{ my: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Chip size="small" label={`${deck.cards.length} questions`} />
          <Chip size="small" label={`${deck.modules.length} modules`} />
          {deck.checkpoints.length > 0 && <Chip size="small" label={`${deck.checkpoints.length} checkpoints`} />}
          <Chip size="small" label={`${exhibitCount} with exhibits`} />
        </Stack>

        {problems.length > 0 && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {problems.length} formatting issue{problems.length === 1 ? '' : 's'} found (the deck still works):
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, maxHeight: 160, overflowY: 'auto' }}>
              {problems.map((p, i) => (
                <li key={i}>
                  <Typography variant="caption">{p}</Typography>
                </li>
              ))}
            </Box>
          </Alert>
        )}
        {imageCount > 0 && source.type === 'manual' && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            {imageCount} question{imageCount === 1 ? ' has' : 's have'} image exhibits. Pasted decks have no source
            URL, so relative image paths will not display — import via GitHub/URL instead if images matter.
          </Alert>
        )}

        <TextField
          label="Deck ID"
          size="small"
          value={id}
          onChange={(e) => setId(e.target.value)}
          error={!!idError}
          helperText={
            idError ??
            (replaces
              ? 'An imported deck with this ID exists — it will be replaced. Study progress for matching question IDs is kept.'
              : 'Used in URLs and to attach study progress. Re-importing with the same ID keeps your progress.')
          }
          sx={{ maxWidth: 420, width: '100%', mb: 2 }}
        />
        {saveError && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {saveError}
          </Alert>
        )}
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="contained"
            color={replaces ? 'warning' : 'primary'}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <DownloadDoneIcon />}
            disabled={!!idError || saving}
            onClick={() => void doImport()}
          >
            {replaces ? 'Replace deck' : 'Import deck'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default function ImportPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('manual')
  const [markdown, setMarkdown] = useState('')
  const [githubLink, setGithubLink] = useState('')
  const [urlLink, setUrlLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<PreparedImport | null>(null)

  const run = async (fn: () => Promise<PreparedImport> | PreparedImport) => {
    setBusy(true)
    setError(null)
    setPrepared(null)
    try {
      setPrepared(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    setMarkdown(text)
    void run(() => deckFromText(text, { type: 'manual' }))
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        Import deck
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Decks are markdown files with <b>Q1.1</b>-style multiple-choice questions (a compiled deck.json works too).
        The built-in “Networking Basics” deck doubles as a format example. Imported decks are stored in this browser.
      </Typography>

      <Card sx={{ mb: 2 }}>
        <Tabs value={mode} onChange={(_, v: Mode) => setMode(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab icon={<EditNoteIcon />} iconPosition="start" label="Paste / file" value="manual" />
          <Tab icon={<GitHubIcon />} iconPosition="start" label="GitHub" value="github" />
          <Tab icon={<LinkIcon />} iconPosition="start" label="URL" value="url" />
        </Tabs>
        <CardContent>
          {mode === 'manual' && (
            <Stack spacing={1.5}>
              <TextField
                label="questions.md content"
                multiline
                minRows={8}
                maxRows={16}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                placeholder={'# My deck\n\nDescription…\n\n## Module 1\n\n**Q1.1** Question?\n\n- A. …\n- B. …\n\n<details><summary>Answer</summary>\n\n**A** — explanation\n\n</details>'}
                slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }}
              />
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained"
                  disabled={busy || !markdown.trim()}
                  onClick={() => void run(() => deckFromText(markdown, { type: 'manual' }))}
                >
                  Preview deck
                </Button>
                <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()}>
                  Load file…
                </Button>
              </Stack>
              <Box
                component="input"
                ref={fileRef}
                type="file"
                accept=".md,.markdown,.json,.txt,text/markdown,application/json,text/plain"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => void handleFile(e.target.files?.[0])}
                sx={{ display: 'none' }}
              />
            </Stack>
          )}
          {mode === 'github' && (
            <Stack spacing={1.5}>
              <TextField
                label="GitHub link"
                value={githubLink}
                onChange={(e) => setGithubLink(e.target.value)}
                placeholder="https://github.com/user/repo or …/blob/main/decks/my-deck/questions.md"
                helperText="Repository, folder or file link. Repos and folders are searched for questions.md / deck.json. Private repos are not supported."
              />
              <Box>
                <Button
                  variant="contained"
                  disabled={busy || !githubLink.trim()}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <GitHubIcon />}
                  onClick={() => void run(() => importFromGithub(githubLink))}
                >
                  Fetch from GitHub
                </Button>
              </Box>
            </Stack>
          )}
          {mode === 'url' && (
            <Stack spacing={1.5}>
              <TextField
                label="Deck URL"
                value={urlLink}
                onChange={(e) => setUrlLink(e.target.value)}
                placeholder="https://example.com/decks/my-deck/questions.md"
                helperText="Direct link to a questions.md or deck.json. The server must allow cross-origin requests (CORS)."
              />
              <Box>
                <Button
                  variant="contained"
                  disabled={busy || !urlLink.trim()}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LinkIcon />}
                  onClick={() => void run(() => importFromUrl(urlLink))}
                >
                  Fetch from URL
                </Button>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
          {error}
        </Alert>
      )}
      {prepared && <DeckPreview prepared={prepared} onDone={(id) => navigate(`/deck/${id}`)} />}
    </Container>
  )
}
