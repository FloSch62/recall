import { useEffect, useRef, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'

const MAX_SCALE = 8
const TAP_SCALE = 2.5
const TAP_SLOP_PX = 8

interface Transform {
  scale: number
  x: number
  y: number
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 }

interface Gesture {
  /** pan anchor (client coords) and the transform at gesture start */
  panX: number
  panY: number
  startX: number
  startY: number
  /** pinch state */
  startScale: number
  startDist: number
  /** image-space point (center-relative, unscaled) under the pinch midpoint */
  anchorX: number
  anchorY: number
  moved: boolean
  onImage: boolean
}

interface Props {
  src: string
  alt: string
  open: boolean
  onClose: () => void
}

/**
 * Fullscreen image viewer: pinch to zoom + drag to pan (touch), wheel zoom
 * (desktop), tap/click the image to toggle zoom, tap the backdrop to close.
 */
export default function ImageLightbox({ src, alt, open, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  const tRef = useRef<Transform>(IDENTITY)
  const [t, setTState] = useState<Transform>(IDENTITY)
  const [dragging, setDragging] = useState(false)

  const setT = (next: Transform) => {
    tRef.current = next
    setTState(next)
  }

  useEffect(() => {
    if (open) {
      tRef.current = IDENTITY
      setTState(IDENTITY)
      pointers.current.clear()
      gesture.current = null
    }
  }, [open])

  /** clamp so the image can't be dragged fully off screen; keep centered while it fits */
  const clamp = (scale: number, x: number, y: number): Transform => {
    const c = containerRef.current
    const img = imgRef.current
    const s = Math.min(MAX_SCALE, Math.max(1, scale))
    if (!c || !img) return { scale: s, x, y }
    const maxX = Math.max(0, (img.clientWidth * s - c.clientWidth) / 2)
    const maxY = Math.max(0, (img.clientHeight * s - c.clientHeight) / 2)
    return { scale: s, x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) }
  }

  /** client coords → coords relative to the container center (the transform origin) */
  const toCenter = (clientX: number, clientY: number) => {
    const r = containerRef.current!.getBoundingClientRect()
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 }
  }

  const zoomAt = (targetScale: number, clientX: number, clientY: number) => {
    const cur = tRef.current
    const p = toCenter(clientX, clientY)
    const ix = (p.x - cur.x) / cur.scale
    const iy = (p.y - cur.y) / cur.scale
    const s = Math.min(MAX_SCALE, Math.max(1, targetScale))
    setT(clamp(s, p.x - ix * s, p.y - iy * s))
  }

  const startPinch = () => {
    const [p1, p2] = [...pointers.current.values()]
    const cur = tRef.current
    const mid = toCenter((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
    gesture.current = {
      ...(gesture.current ?? { moved: false, onImage: false }),
      panX: 0,
      panY: 0,
      startX: cur.x,
      startY: cur.y,
      startScale: cur.scale,
      startDist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
      anchorX: (mid.x - cur.x) / cur.scale,
      anchorY: (mid.y - cur.y) / cur.scale,
      moved: true,
    } as Gesture
  }

  const startPan = (clientX: number, clientY: number, keepMoved: boolean) => {
    const cur = tRef.current
    gesture.current = {
      panX: clientX,
      panY: clientY,
      startX: cur.x,
      startY: cur.y,
      startScale: cur.scale,
      startDist: 0,
      anchorX: 0,
      anchorY: 0,
      moved: keepMoved ? (gesture.current?.moved ?? false) : false,
      onImage: gesture.current?.onImage ?? false,
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const onImage = e.target === imgRef.current
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setDragging(true)
    if (pointers.current.size === 2) {
      startPinch()
    } else if (pointers.current.size === 1) {
      startPan(e.clientX, e.clientY, false)
      gesture.current!.onImage = onImage
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return

    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()]
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y)
      if (dist <= 0 || g.startDist <= 0) return
      const s = Math.min(MAX_SCALE, Math.max(1, g.startScale * (dist / g.startDist)))
      const mid = toCenter((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
      g.moved = true
      setT(clamp(s, mid.x - g.anchorX * s, mid.y - g.anchorY * s))
    } else if (pointers.current.size === 1) {
      const dx = e.clientX - g.panX
      const dy = e.clientY - g.panY
      if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP_PX) g.moved = true
      if (tRef.current.scale > 1) {
        setT(clamp(g.startScale, g.startX + dx, g.startY + dy))
      }
    }
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)

    if (pointers.current.size === 1) {
      // pinch ended with one finger still down — continue as pan
      const [rest] = [...pointers.current.values()]
      startPan(rest.x, rest.y, true)
      return
    }
    if (pointers.current.size > 0) return

    setDragging(false)
    const g = gesture.current
    gesture.current = null
    if (!g || g.moved || e.type === 'pointercancel') return

    // clean tap/click
    if (g.onImage) {
      if (tRef.current.scale > 1.05) setT(IDENTITY)
      else zoomAt(TAP_SCALE, e.clientX, e.clientY)
    } else {
      onClose()
    }
  }

  // Wheel zoom needs a non-passive native listener (preventDefault also keeps
  // trackpad pinch from zooming the whole page). Attached via ref callback:
  // MUI's Portal mounts the dialog DOM a render after `open` flips, so an
  // effect keyed on [open] would still see a null ref here.
  const attachContainer = (el: HTMLDivElement | null) => {
    containerRef.current = el
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // trackpad pinch arrives as ctrl+wheel with small deltas — amplify it
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002))
      zoomAt(tRef.current.scale * factor, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      containerRef.current = null
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      slotProps={{ paper: { sx: { bgcolor: 'rgba(8, 8, 10, 0.96)' } } }}
    >
      <IconButton
        onClick={onClose}
        aria-label="close image"
        sx={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top) + 10px)',
          right: 12,
          zIndex: 2,
          color: '#fff',
          bgcolor: 'rgba(255,255,255,0.12)',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.22)' },
        }}
      >
        <CloseIcon />
      </IconButton>
      <Box
        ref={attachContainer}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        sx={{
          position: 'fixed',
          inset: 0,
          overflow: 'hidden',
          touchAction: 'none',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 1,
        }}
      >
        <Box
          component="img"
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          sx={{
            maxWidth: '100%',
            maxHeight: '100%',
            bgcolor: '#fff',
            borderRadius: t.scale === 1 ? 1 : 0,
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 0.25s ease',
            willChange: 'transform',
            cursor: t.scale > 1 ? 'grab' : 'zoom-in',
          }}
        />
      </Box>
    </Dialog>
  )
}
