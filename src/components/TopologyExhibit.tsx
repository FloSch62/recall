import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded'
import { useColorScheme, useTheme } from '@mui/material/styles'
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { TopologyLink, TopologyNode, TopologySpec } from '../lib/types'

/**
 * Static network-topology exhibit in the visual style of the official 4A0-D01
 * practice-exam diagrams: tiered layout (WAN cloud / spines / leafs / hosts),
 * straight center-to-center links with subnet + interface end labels, AS group
 * boxes and red premise callouts.
 */

const ROW_GAP = 150
const NODE_W = 128
const KIND_TIER: Record<TopologyNode['kind'], number> = {
  cloud: 0,
  superspine: 1,
  spine: 2,
  router: 2,
  leaf: 3,
  server: 4,
  host: 4,
  vm: 4,
}
// icon box (the dark chassis / cloud / tower) dimensions per kind
const BOX: Record<TopologyNode['kind'], { w: number; h: number }> = {
  cloud: { w: 118, h: 54 },
  superspine: { w: 52, h: 42 },
  spine: { w: 52, h: 42 },
  router: { w: 52, h: 42 },
  leaf: { w: 52, h: 42 },
  server: { w: 34, h: 52 },
  host: { w: 34, h: 52 },
  vm: { w: 46, h: 40 },
}

const LABEL_H = 19
const NOTE_H = 14
const AS_H = 17

interface Placed {
  node: TopologyNode
  x: number // top-left of the NODE_W-wide container
  y: number
  labelAbove: boolean
  boxCx: number // center of the icon box, flow coords
  boxCy: number
  totalH: number
}

function extraH(n: TopologyNode): number {
  return LABEL_H + (n.notes?.length ?? 0) * NOTE_H + (n.as ? AS_H : 0)
}

function layout(spec: TopologySpec): Map<string, Placed> {
  const tierOf = (n: TopologyNode) => n.tier ?? KIND_TIER[n.kind] ?? 2
  const tiers = [...new Set(spec.nodes.map(tierOf))].sort((a, b) => a - b)
  const placed = new Map<string, Placed>()
  const neighbors = new Map<string, string[]>()
  for (const l of spec.links ?? []) {
    neighbors.set(l.from, [...(neighbors.get(l.from) ?? []), l.to])
    neighbors.set(l.to, [...(neighbors.get(l.to) ?? []), l.from])
  }

  tiers.forEach((tier, rowIdx) => {
    let row = spec.nodes.filter((n) => tierOf(n) === tier)
    if (rowIdx > 0) {
      // order by barycenter of already-placed neighbors to keep hosts under their leafs
      const bary = (n: TopologyNode) => {
        const xs = (neighbors.get(n.id) ?? [])
          .map((id) => placed.get(id)?.boxCx)
          .filter((v): v is number => v !== undefined)
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.POSITIVE_INFINITY
      }
      row = row
        .map((n, i) => ({ n, i, b: bary(n) }))
        .sort((a, b) => (a.b === b.b ? a.i - b.i : a.b - b.b))
        .map((r) => r.n)
    }
    const gap = 42
    const total = row.length * NODE_W + (row.length - 1) * gap
    row.forEach((n, i) => {
      const x = i * (NODE_W + gap) - total / 2
      const y = rowIdx * ROW_GAP
      const labelAbove = tier <= 2 && n.kind !== 'cloud'
      const box = BOX[n.kind]
      placed.set(n.id, {
        node: n,
        x,
        y,
        labelAbove,
        boxCx: x + NODE_W / 2,
        boxCy: y + (labelAbove ? LABEL_H + box.h / 2 : box.h / 2),
        totalH: box.h + extraH(n),
      })
    })
  })
  return placed
}

/** Point where the segment from (cx,cy) toward (tx,ty) leaves the w×h box centered on (cx,cy). */
function boxExit(cx: number, cy: number, tx: number, ty: number, w: number, h: number) {
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const scale = 1 / Math.max(Math.abs(dx) / (w / 2), Math.abs(dy) / (h / 2))
  return { x: cx + dx * scale, y: cy + dy * scale }
}

// ---------- custom nodes ----------

const chassisSx = {
  borderRadius: '5px',
  bgcolor: '#141f38',
  border: '1px solid #2c3a5c',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  mx: 'auto',
}

function DeviceGlyph({ kind }: { kind: TopologyNode['kind'] }) {
  const box = BOX[kind]
  if (kind === 'server' || kind === 'host') {
    return (
      <Box sx={{ ...chassisSx, width: box.w, height: box.h, gap: '3px' }}>
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={{ width: box.w - 14, height: 4, borderRadius: 1, bgcolor: '#e8edf5' }} />
        ))}
        <Box sx={{ width: box.w - 14, height: 10, borderRadius: 1, bgcolor: '#3d4d75' }} />
      </Box>
    )
  }
  if (kind === 'vm') {
    return (
      <Box sx={{ ...chassisSx, width: box.w, height: box.h, bgcolor: '#1c3a5e', border: '1px dashed #7ea7d8' }}>
        <Box sx={{ color: '#dbe7f5', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>VM</Box>
      </Box>
    )
  }
  // spine / leaf / superspine / router chassis with white slots
  return (
    <Box sx={{ ...chassisSx, width: box.w, height: box.h }}>
      {[0, 1, 2].map((i) => (
        <Box key={i} sx={{ width: box.w - 18, height: 5, borderRadius: 0.5, bgcolor: '#e8edf5' }} />
      ))}
    </Box>
  )
}

function CloudGlyph({ label }: { label?: string }) {
  const box = BOX.cloud
  return (
    <Box
      sx={{
        width: box.w,
        height: box.h,
        mx: 'auto',
        borderRadius: '50%',
        bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.3)'),
        display: 'grid',
        placeItems: 'center',
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {label}
    </Box>
  )
}

type NetNodeType = Node<{ placed: Placed }, 'net'>

function NetNode({ data }: NodeProps<NetNodeType>) {
  const { node, labelAbove } = data.placed
  // Inline text gets a paper background so it masks link lines passing underneath.
  const mask = { bgcolor: 'background.paper', borderRadius: 0.5, px: 0.4, width: 'fit-content', mx: 'auto' }
  // cloud draws its label inside the glyph
  const label = node.label && node.kind !== 'cloud' ? (
    <Box sx={{ fontSize: 12.5, fontWeight: 700, lineHeight: `${LABEL_H}px`, textAlign: 'center', ...mask }}>
      {node.label}
    </Box>
  ) : null
  const meta = (
    <>
      {node.notes?.map((line) => (
        <Box
          key={line}
          sx={{ fontSize: 10.5, lineHeight: `${NOTE_H}px`, textAlign: 'center', color: 'text.secondary', ...mask }}
        >
          {line}
        </Box>
      ))}
      {node.as && (
        <Box sx={{ fontSize: 11, fontWeight: 800, lineHeight: `${AS_H}px`, textAlign: 'center', ...mask }}>{node.as}</Box>
      )}
    </>
  )
  return (
    <Box sx={{ width: NODE_W, cursor: 'default' }}>
      <Handle type="source" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      {labelAbove && label}
      {node.kind === 'cloud' ? <CloudGlyph label={node.label} /> : <DeviceGlyph kind={node.kind} />}
      {!labelAbove && label}
      {meta}
    </Box>
  )
}

type GroupBoxType = Node<{ w: number; h: number; label?: string }, 'groupBox'>

function GroupBoxNode({ data }: NodeProps<GroupBoxType>) {
  return (
    <Box
      sx={{
        width: data.w,
        height: data.h,
        borderRadius: 2,
        bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.16)'),
        position: 'relative',
      }}
    >
      {data.label && (
        <Box sx={{ position: 'absolute', top: 3, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, fontWeight: 800 }}>
          {data.label}
        </Box>
      )}
    </Box>
  )
}

type CalloutType = Node<{ text: string }, 'callout'>

function CalloutNode({ data }: NodeProps<CalloutType>) {
  return (
    <Box
      sx={{
        maxWidth: 190,
        px: 1,
        py: 0.5,
        border: '1.5px solid #dc2626',
        borderRadius: 1,
        bgcolor: 'background.paper',
        fontSize: 10.5,
        lineHeight: 1.35,
      }}
    >
      <Handle type="source" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
      {data.text}
    </Box>
  )
}

// ---------- custom edge ----------

interface LinkData {
  x1: number
  y1: number
  x2: number
  y2: number
  link: TopologyLink
  [key: string]: unknown
}

const LINK_STYLE: Record<string, { stroke: string; strokeWidth: number; strokeDasharray?: string }> = {
  link: { stroke: '#94a3b8', strokeWidth: 1.6 },
  ebgp: { stroke: '#f59e0b', strokeWidth: 1.8 },
  lag: { stroke: '#64748b', strokeWidth: 3.4 },
  tunnel: { stroke: '#0ea5e9', strokeWidth: 2.6, strokeDasharray: '7 5' },
  down: { stroke: '#dc2626', strokeWidth: 1.8, strokeDasharray: '5 4' },
}

function at(t: number, a: number, b: number) {
  return a + (b - a) * t
}

type LinkEdgeType = Edge<LinkData, 'net'>

function LinkEdge({ data, markerEnd, markerStart }: EdgeProps<LinkEdgeType>) {
  if (!data) return null
  const { x1, y1, x2, y2, link } = data
  const style = LINK_STYLE[link.kind ?? 'link'] ?? LINK_STYLE.link
  const chip = (t: number, text: string, boxed: boolean) => (
    <Box
      sx={{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${at(t, x1, x2)}px, ${at(t, y1, y2)}px)`,
        fontSize: 10,
        fontWeight: 600,
        px: boxed ? 0.6 : 0.25,
        borderRadius: 0.75,
        bgcolor: 'background.paper',
        border: boxed ? 1 : 0,
        borderColor: 'divider',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </Box>
  )
  return (
    <>
      <BaseEdge
        path={`M ${x1} ${y1} L ${x2} ${y2}`}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
      <EdgeLabelRenderer>
        {link.fromEnd && chip(0.18, link.fromEnd, false)}
        {link.label && chip(0.5, link.label, true)}
        {link.toEnd && chip(0.82, link.toEnd, false)}
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { net: NetNode, groupBox: GroupBoxNode, callout: CalloutNode }
const edgeTypes = { net: LinkEdge }

// ---------- main component ----------

export default function TopologyExhibit({ spec }: { spec: TopologySpec }) {
  const theme = useTheme()
  const { mode, systemMode } = useColorScheme()
  const resolvedMode = (mode === 'system' ? systemMode : mode) ?? 'light'
  const [open, setOpen] = useState(false)

  const { nodes, edges, rows } = useMemo(() => {
    const placed = layout(spec)
    const nodes: Node[] = []
    const edges: Edge[] = []

    for (const g of spec.groups ?? []) {
      const members = g.nodes.map((id) => placed.get(id)).filter((p): p is Placed => !!p)
      if (!members.length) continue
      const pad = 12
      const x0 = Math.min(...members.map((p) => p.boxCx - NODE_W / 2)) - pad
      const y0 = Math.min(...members.map((p) => p.y)) - pad - (g.label ? 6 : 0)
      const x1 = Math.max(...members.map((p) => p.boxCx + NODE_W / 2)) + pad
      const y1 = Math.max(...members.map((p) => p.y + p.totalH)) + pad
      nodes.push({
        id: `group-${g.label ?? nodes.length}`,
        type: 'groupBox',
        position: { x: x0, y: y0 },
        data: { w: x1 - x0, h: y1 - y0, label: g.label },
        zIndex: -10,
        selectable: false,
        draggable: false,
      })
    }

    for (const p of placed.values()) {
      nodes.push({
        id: p.node.id,
        type: 'net',
        position: { x: p.x, y: p.y },
        data: { placed: p },
        selectable: false,
        draggable: false,
      })
    }

    ;(spec.links ?? []).forEach((link, i) => {
      const a = placed.get(link.from)
      const b = placed.get(link.to)
      if (!a || !b) return
      const boxA = BOX[a.node.kind]
      const boxB = BOX[b.node.kind]
      const p1 = boxExit(a.boxCx, a.boxCy, b.boxCx, b.boxCy, boxA.w + 2, boxA.h + 2)
      const p2 = boxExit(b.boxCx, b.boxCy, a.boxCx, a.boxCy, boxB.w + 2, boxB.h + 2)
      const arrows =
        link.kind === 'ebgp'
          ? {
              markerStart: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 13, height: 13 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 13, height: 13 },
            }
          : {}
      edges.push({
        id: `link-${i}`,
        source: link.from,
        target: link.to,
        type: 'net',
        data: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, link },
        ...arrows,
      })
    })

    ;(spec.callouts ?? []).forEach((c, i) => {
      const p = placed.get(c.node)
      if (!p) return
      const id = `callout-${i}`
      const x = p.boxCx + NODE_W / 2 + 46
      const y = p.boxCy - 14
      nodes.push({
        id,
        type: 'callout',
        position: { x, y },
        data: { text: c.text },
        selectable: false,
        draggable: false,
      })
      edges.push({
        id: `callout-line-${i}`,
        source: id,
        target: c.node,
        type: 'net',
        data: {
          x1: x,
          y1: y + 14,
          x2: p.boxCx + BOX[p.node.kind].w / 2,
          y2: p.boxCy,
          link: { from: id, to: c.node, kind: 'down' },
        },
      })
    })

    const tierCount = new Set([...placed.values()].map((p) => p.y)).size
    return { nodes, edges, rows: tierCount }
  }, [spec])

  const flow = (interactive: boolean) => (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode={resolvedMode}
      fitView
      fitViewOptions={{ padding: interactive ? 0.15 : 0.07 }}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      panOnDrag={interactive}
      zoomOnScroll={interactive}
      zoomOnPinch={interactive}
      zoomOnDoubleClick={interactive}
      preventScrolling={interactive}
      minZoom={0.3}
      maxZoom={4}
    />
  )

  // React Flow renders its own pane backgrounds; keep them transparent.
  const flowSx = {
    '& .react-flow__pane, & .react-flow': { bgcolor: 'transparent !important' },
    '& .react-flow__attribution': { display: 'none' },
  }

  return (
    <>
      <Box
        onClick={() => setOpen(true)}
        title="Click to enlarge"
        sx={{
          my: 1.5,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          overflow: 'hidden',
          position: 'relative',
          height: Math.min(150 * rows + 90, 430),
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff',
          ...flowSx,
          '& .react-flow__pane': { cursor: 'zoom-in' },
        }}
      >
        {flow(false)}
        <FullscreenRoundedIcon
          fontSize="small"
          sx={{ position: 'absolute', top: 8, right: 8, color: 'text.disabled', pointerEvents: 'none' }}
        />
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen
        slotProps={{ paper: { sx: { bgcolor: 'background.default' } } }}
      >
        <IconButton
          onClick={() => setOpen(false)}
          aria-label="close diagram"
          sx={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top) + 10px)',
            right: 12,
            zIndex: 2,
            bgcolor: 'action.selected',
            '&:hover': { bgcolor: 'action.focus' },
          }}
        >
          <CloseIcon />
        </IconButton>
        <Box sx={{ position: 'fixed', inset: 0, ...flowSx }}>{flow(true)}</Box>
      </Dialog>
    </>
  )
}
