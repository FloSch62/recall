import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

export function Loading() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
      <CircularProgress />
    </Box>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="error">{message}</Alert>
    </Box>
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, onClose, onConfirm }: ConfirmProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
