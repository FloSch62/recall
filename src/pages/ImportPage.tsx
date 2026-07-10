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
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import GitHubIcon from '@mui/icons-material/GitHub'
import LinkIcon from '@mui/icons-material/Link'
import EditNoteIcon from '@mui/icons-material/EditNote'
import DownloadDoneIcon from '@mui/icons-material/DownloadDone'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { useDeckIndex } from '../lib/decks'
import { saveImportedDecks, useImportedDecks } from '../lib/importedDecks'
import {
  deckFromText,
  importFromGithub,
  importFromUrl,
  prepareGithubImport,
  type PreparedImport,
} from '../lib/importSource'
import { discoverGithubDecks, type DiscoveredGithubDeck } from '../lib/github'
import {
  clearGithubToken,
  getGithubToken,
  setGithubToken as rememberGithubToken,
} from '../lib/githubAuth'
import { slugify } from '../lib/parseDeckMd'
import { stripHtml } from '../lib/format'

type Mode = 'manual' | 'github' | 'url'

interface ImportDraft {
  key: string
  label: string
  prepared: PreparedImport | null
  id: string
  selected: boolean
  error: string | null
}

function draftFromPrepared(prepared: PreparedImport, key = 'single', label = ''): ImportDraft {
  return { key, label, prepared, id: prepared.deck.id, selected: true, error: null }
}

interface DeckPreviewProps {
  draft: ImportDraft
  idError: string | null
  replaces: boolean
  onChange: (patch: Partial<Pick<ImportDraft, 'id' | 'selected'>>) => void
}

function DeckPreview({ draft, idError, replaces, onChange }: DeckPreviewProps) {
  if (draft.error || !draft.prepared) {
    return (
      <Alert severity="error">
        {draft.label && <b>{draft.label}: </b>}
        {draft.error ?? 'This deck could not be prepared.'}
      </Alert>
    )
  }

  const { deck, problems, source } = draft.prepared
  const exhibitCount = deck.cards.filter((card) => card.exhibits.length > 0).length
  const imageCount = deck.cards.filter((card) => card.exhibits.some((exhibit) => exhibit.type === 'image')).length

  return (
    <Card variant="outlined" sx={{ opacity: draft.selected ? 1 : 0.68 }}>
      <CardContent>
        <FormControlLabel
          control={<Checkbox checked={draft.selected} onChange={(event) => onChange({ selected: event.target.checked })} />}
          label={<Typography variant="subtitle2">Import this deck</Typography>}
          sx={{ mb: 0.5 }}
        />
        {draft.label && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, wordBreak: 'break-all' }}>
            {draft.label}
          </Typography>
        )}
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
              {problems.map((problem, index) => (
                <li key={`${problem}-${index}`}>
                  <Typography variant="caption">{problem}</Typography>
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
          value={draft.id}
          disabled={!draft.selected}
          onChange={(event) => onChange({ id: event.target.value })}
          error={draft.selected && !!idError}
          helperText={
            draft.selected
              ? idError ??
                (replaces
                  ? 'An imported deck with this ID exists — it will be replaced. Matching study progress is kept.'
                  : 'Used in URLs and to attach study progress. Re-importing with the same ID keeps your progress.')
              : 'This deck will be skipped.'
          }
          sx={{ maxWidth: 460, width: '100%' }}
        />
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
  const [tokenInput, setTokenInput] = useState(() => getGithubToken())
  const [urlLink, setUrlLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discovered, setDiscovered] = useState<DiscoveredGithubDeck[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set())
  const [drafts, setDrafts] = useState<ImportDraft[]>([])
  const [saving, setSaving] = useState(false)
  const { index } = useDeckIndex()
  const imported = useImportedDecks()

  const builtinIds = useMemo(
    () => new Set((index?.decks ?? []).filter((deck) => deck.origin !== 'imported').map((deck) => deck.id)),
    [index],
  )
  const importedIds = useMemo(() => new Set(imported.summaries.map((summary) => summary.id)), [imported])
  const cleanIds = useMemo(() => drafts.map((draft) => slugify(draft.id)), [drafts])
  const duplicateIds = useMemo(() => {
    const counts = new Map<string, number>()
    drafts.forEach((draft, index) => {
      if (draft.selected && draft.prepared && cleanIds[index])
        counts.set(cleanIds[index], (counts.get(cleanIds[index]) ?? 0) + 1)
    })
    return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id))
  }, [drafts, cleanIds])

  const idErrors = drafts.map((draft, index) => {
    if (!draft.selected || !draft.prepared) return null
    const id = cleanIds[index]
    if (!id) return 'Deck ID must contain at least one letter or number.'
    if (builtinIds.has(id)) return 'This ID belongs to a built-in deck — choose another.'
    if (duplicateIds.has(id)) return 'Another selected deck uses this ID.'
    return null
  })
  const selectedDrafts = drafts.filter((draft) => draft.selected && draft.prepared)
  const hasReplacements = drafts.some(
    (draft, index) => draft.selected && !!draft.prepared && importedIds.has(cleanIds[index]),
  )
  const canImport = selectedDrafts.length > 0 && !idErrors.some(Boolean) && !saving

  const resetResults = () => {
    setError(null)
    setDiscovered([])
    setSelectedPaths(new Set())
    setDrafts([])
  }

  const runSingle = async (fn: () => Promise<PreparedImport> | PreparedImport) => {
    setBusy(true)
    resetResults()
    try {
      setDrafts([draftFromPrepared(await fn())])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    setMarkdown(text)
    void runSingle(() => deckFromText(text, { type: 'manual' }))
    if (fileRef.current) fileRef.current.value = ''
  }

  const findGithubDecks = async () => {
    setBusy(true)
    resetResults()
    const token = tokenInput.trim()
    try {
      if (new URL(githubLink.trim()).hostname === 'gist.githubusercontent.com') {
        const prepared = await importFromGithub(githubLink, token)
        setDrafts([draftFromPrepared(prepared)])
      } else {
        const found = await discoverGithubDecks(githubLink, token)
        rememberGithubToken(token)
        if (found.length === 1) {
          const prepared = await prepareGithubImport(found[0], token)
          setDrafts([draftFromPrepared(prepared, found[0].path, found[0].path)])
        } else {
          setDiscovered(found)
          setSelectedPaths(new Set(found.map((candidate) => candidate.path)))
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const previewSelectedGithubDecks = async () => {
    const selected = discovered.filter((candidate) => selectedPaths.has(candidate.path))
    if (selected.length === 0) return
    setBusy(true)
    setError(null)
    setDrafts([])
    const token = tokenInput.trim()
    rememberGithubToken(token)
    try {
      const results = await Promise.allSettled(selected.map((candidate) => prepareGithubImport(candidate, token)))
      setDrafts(
        results.map((result, index): ImportDraft =>
          result.status === 'fulfilled'
            ? draftFromPrepared(result.value, selected[index].path, selected[index].path)
            : {
                key: selected[index].path,
                label: selected[index].path,
                prepared: null,
                id: '',
                selected: false,
                error: result.reason instanceof Error ? result.reason.message : String(result.reason),
              },
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const updateDraft = (index: number, patch: Partial<Pick<ImportDraft, 'id' | 'selected'>>) => {
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)))
  }

  const importDecks = async () => {
    if (!canImport) return
    setSaving(true)
    setError(null)
    try {
      const entries = drafts.flatMap((draft, index) =>
        draft.selected && draft.prepared
          ? [{ deck: { ...draft.prepared.deck, id: cleanIds[index] }, source: draft.prepared.source }]
          : [],
      )
      await saveImportedDecks(entries)
      navigate(entries.length === 1 ? `/deck/${entries[0].deck.id}` : '/')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not store the decks.')
      setSaving(false)
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        Import deck
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Decks are markdown files with <b>Q1.1</b>-style multiple-choice questions (a compiled deck.json works too).
        Imported decks are stored in this browser.
      </Typography>

      <Card sx={{ mb: 2 }}>
        <Tabs
          value={mode}
          onChange={(_, value: Mode) => {
            setMode(value)
            resetResults()
          }}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab icon={<EditNoteIcon />} iconPosition="start" label="Paste / file" value="manual" />
          <Tab icon={<GitHubIcon />} iconPosition="start" label="GitHub" value="github" />
          <Tab icon={<LinkIcon />} iconPosition="start" label="URL" value="url" />
        </Tabs>
        <CardContent>
          {mode === 'manual' ? (
            <Stack spacing={1.5}>
              <TextField
                label="questions.md content"
                multiline
                minRows={8}
                maxRows={16}
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                placeholder={'# My deck\n\nDescription…\n\n## Module 1\n\n**Q1.1** Question?\n\n- A. …\n- B. …'}
                slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }}
              />
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained"
                  disabled={busy || !markdown.trim()}
                  onClick={() => void runSingle(() => deckFromText(markdown, { type: 'manual' }))}
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
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => void handleFile(event.target.files?.[0])}
                sx={{ display: 'none' }}
              />
            </Stack>
          ) : mode === 'github' ? (
            <Stack spacing={1.5}>
              <TextField
                label="GitHub link"
                value={githubLink}
                onChange={(event) => setGithubLink(event.target.value)}
                placeholder="https://github.com/user/repo or …/tree/main/decks"
                helperText="Repository, folder or questions.md/deck.json link. Repositories and folders are searched recursively."
              />
              <TextField
                label="Fine-grained token (optional for public repositories)"
                type="password"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                helperText="Use a repository-scoped token with Contents: read. Recall keeps it only in memory until reload or close."
                slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <Button
                  variant="contained"
                  disabled={busy || !githubLink.trim()}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <GitHubIcon />}
                  onClick={() => void findGithubDecks()}
                >
                  Find decks
                </Button>
                {tokenInput && (
                  <Button
                    size="small"
                    onClick={() => {
                      clearGithubToken()
                      setTokenInput('')
                    }}
                  >
                    Clear token
                  </Button>
                )}
                <Link
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noreferrer"
                  variant="caption"
                >
                  Create a fine-grained token
                </Link>
              </Stack>
              <Alert icon={<LockOutlinedIcon />} severity="info">
                The token is sent only to GitHub’s API and is never written to browser storage, deck records, or exports.
              </Alert>
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              <TextField
                label="Deck URL"
                value={urlLink}
                onChange={(event) => setUrlLink(event.target.value)}
                placeholder="https://example.com/decks/my-deck/questions.md"
                helperText="Direct link to questions.md or deck.json. The server must allow cross-origin requests (CORS)."
              />
              <Box>
                <Button
                  variant="contained"
                  disabled={busy || !urlLink.trim()}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LinkIcon />}
                  onClick={() => void runSingle(() => importFromUrl(urlLink))}
                >
                  Fetch from URL
                </Button>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>

      {discovered.length > 1 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
              Found {discovered.length} decks
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Choose which deck folders to fetch and preview.
            </Typography>
            <Stack spacing={0} sx={{ mb: 1.5 }}>
              {discovered.map((candidate) => (
                <FormControlLabel
                  key={candidate.path}
                  control={
                    <Checkbox
                      checked={selectedPaths.has(candidate.path)}
                      onChange={(event) => {
                        setSelectedPaths((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(candidate.path)
                          else next.delete(candidate.path)
                          return next
                        })
                      }}
                    />
                  }
                  label={candidate.path}
                />
              ))}
            </Stack>
            <Button
              variant="contained"
              disabled={busy || selectedPaths.size === 0}
              onClick={() => void previewSelectedGithubDecks()}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              Preview selected ({selectedPaths.size})
            </Button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
          {error}
        </Alert>
      )}

      {drafts.length > 0 && (
        <Stack spacing={2}>
          {drafts.map((draft, index) => (
            <DeckPreview
              key={draft.key}
              draft={draft}
              idError={idErrors[index]}
              replaces={!!cleanIds[index] && importedIds.has(cleanIds[index])}
              onChange={(patch) => updateDraft(index, patch)}
            />
          ))}
          {selectedDrafts.length > 0 && (
            <Box>
              <Button
                variant="contained"
                color={hasReplacements ? 'warning' : 'primary'}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <DownloadDoneIcon />}
                disabled={!canImport}
                onClick={() => void importDecks()}
              >
                Import {selectedDrafts.length === 1 ? 'deck' : `${selectedDrafts.length} decks`}
              </Button>
            </Box>
          )}
        </Stack>
      )}
    </Container>
  )
}
