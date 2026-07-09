import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#4756c4' },
        secondary: { main: '#00796b' },
        background: { default: '#f4f6fb', paper: '#ffffff' },
        info: { main: '#0277bd' },
        success: { main: '#2e7d32' },
        warning: { main: '#b26a00' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#93a4ff' },
        secondary: { main: '#4db6ac' },
        background: { default: '#10131a', paper: '#181c26' },
        info: { main: '#4fc3f7' },
        success: { main: '#81c784' },
        warning: { main: '#ffb74d' },
      },
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCard: {
      defaultProps: { variant: 'outlined' },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
  },
})
