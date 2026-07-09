import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness'
import { useColorScheme } from '@mui/material/styles'

const ORDER = ['light', 'dark', 'system'] as const

export default function ModeToggle() {
  const { mode, setMode } = useColorScheme()
  const current = mode ?? 'system'
  const next = ORDER[(ORDER.indexOf(current as (typeof ORDER)[number]) + 1) % ORDER.length]
  const icon =
    current === 'light' ? <LightModeIcon /> : current === 'dark' ? <DarkModeIcon /> : <SettingsBrightnessIcon />
  return (
    <Tooltip title={`Theme: ${current} — tap for ${next}`}>
      <IconButton onClick={() => setMode(next)} color="inherit" aria-label={`theme ${current}`}>
        {icon}
      </IconButton>
    </Tooltip>
  )
}
