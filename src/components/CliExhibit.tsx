import Box from '@mui/material/Box'

/** Terminal-style exhibit block, mimicking the CLI screenshots in the official practice exam. */
export default function CliExhibit({ text }: { text: string }) {
  return (
    <Box
      component="pre"
      sx={{
        px: 1.5,
        py: 1.25,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.035)',
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12.5,
        lineHeight: 1.45,
        overflowX: 'auto',
        whiteSpace: 'pre',
        m: 0,
        mt: 1.5,
        mb: 1.5,
      }}
    >
      {text}
    </Box>
  )
}
