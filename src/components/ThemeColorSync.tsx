import { useEffect } from 'react'
import { useColorScheme } from '@mui/material/styles'
import { appThemeColors } from '../theme'

const LIGHT_MEDIA = '(prefers-color-scheme: light)'
const DARK_MEDIA = '(prefers-color-scheme: dark)'

function ensureThemeColorMeta(scheme: 'light' | 'dark', media: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="theme-color"][data-color-scheme="${scheme}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.dataset.colorScheme = scheme
    document.head.appendChild(meta)
  }
  meta.media = media
  return meta
}

export default function ThemeColorSync() {
  const { mode } = useColorScheme()

  useEffect(() => {
    const lightMeta = ensureThemeColorMeta('light', LIGHT_MEDIA)
    const darkMeta = ensureThemeColorMeta('dark', DARK_MEDIA)

    if (mode === 'light' || mode === 'dark') {
      lightMeta.removeAttribute('media')
      lightMeta.content = appThemeColors[mode]
      darkMeta.media = 'not all'
      darkMeta.content = appThemeColors[mode]
      return
    }

    lightMeta.media = LIGHT_MEDIA
    lightMeta.content = appThemeColors.light
    darkMeta.media = DARK_MEDIA
    darkMeta.content = appThemeColors.dark
  }, [mode])

  return null
}
