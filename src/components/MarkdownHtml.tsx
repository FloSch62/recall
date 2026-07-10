import { useMemo } from 'react'
import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'
import { sanitizeDeckHtml } from '../lib/sanitizeHtml'

interface Props {
  html: string
  sx?: SxProps<Theme>
}

/** Renders build-time-sanitized deck HTML (escaped + markdown-rendered by scripts/build-decks.mjs). */
export default function MarkdownHtml({ html, sx }: Props) {
  const safeHtml = useMemo(() => sanitizeDeckHtml(html), [html])
  return (
    <Box
      sx={[
        {
          lineHeight: 1.55,
          overflowWrap: 'break-word',
          '& p': { m: 0, mb: 1 },
          '& p:last-child': { mb: 0 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )
}
