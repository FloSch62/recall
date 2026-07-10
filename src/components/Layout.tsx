import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import SchoolIcon from '@mui/icons-material/School'
import StyleIcon from '@mui/icons-material/Style'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import SettingsIcon from '@mui/icons-material/Settings'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import ModeToggle from './ModeToggle'

const NAV = [
  { label: 'Decks', path: '/', icon: <StyleIcon /> },
  { label: 'Stats', path: '/stats', icon: <QueryStatsIcon /> },
  { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
]

function navValue(pathname: string): string {
  if (pathname.startsWith('/stats')) return '/stats'
  if (pathname.startsWith('/settings')) return '/settings'
  return '/'
}

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  // study, practice & quest lessons are immersive: hide the bottom nav so the answer bar owns the bottom edge
  const immersive =
    /\/(study|practice)$/.test(location.pathname) ||
    /\/quest\/(?:\d+\/\d+|checkpoint\/[^/]+)$/.test(location.pathname)
  const value = navValue(location.pathname)

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="sticky"
        elevation={0}
        color="transparent"
        sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <ButtonBase
            onClick={() => navigate('/')}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, px: 1, py: 0.5 }}
          >
            <SchoolIcon color="primary" />
            <Typography variant="h6" component="span" color="text.primary">
              Recall
            </Typography>
          </ButtonBase>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5, mr: 1 }}>
            {NAV.map((n) => (
              <Button
                key={n.path}
                color={value === n.path ? 'primary' : 'inherit'}
                startIcon={n.icon}
                onClick={() => navigate(n.path)}
              >
                {n.label}
              </Button>
            ))}
          </Box>
          <ModeToggle />
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, pb: { xs: immersive ? 0 : 9, sm: 0 } }}>
        <Outlet />
      </Box>

      {!immersive && (
        <Paper
          elevation={3}
          square
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            display: { xs: 'block', sm: 'none' },
            pb: 'env(safe-area-inset-bottom)',
            zIndex: (t) => t.zIndex.appBar,
          }}
        >
          <BottomNavigation showLabels value={value} onChange={(_, v: string) => navigate(v)}>
            {NAV.map((n) => (
              <BottomNavigationAction key={n.path} label={n.label} value={n.path} icon={n.icon} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  )
}
