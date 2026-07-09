export interface DeckSummary {
  id: string
  title: string
  description: string
  cardCount: number
  moduleCount: number
  exhibitCount: number
  /** set for decks imported at runtime; absent for built-in decks */
  origin?: 'imported'
}

export interface TopologyNode {
  id: string
  kind: 'cloud' | 'superspine' | 'spine' | 'leaf' | 'server' | 'host' | 'router' | 'vm'
  label?: string
  as?: string
  notes?: string[]
  tier?: number
}

export interface TopologyLink {
  from: string
  to: string
  label?: string
  fromEnd?: string
  toEnd?: string
  kind?: 'link' | 'ebgp' | 'lag' | 'tunnel' | 'down'
}

export interface TopologySpec {
  nodes: TopologyNode[]
  links?: TopologyLink[]
  groups?: { label?: string; nodes: string[] }[]
  callouts?: { node: string; text: string }[]
}

export type Exhibit =
  | { type: 'cli'; text: string }
  | { type: 'topology'; spec: TopologySpec }
  | { type: 'image'; src: string }

export interface DeckIndex {
  decks: DeckSummary[]
}

export interface CardOption {
  key: string
  html: string
}

export interface Card {
  id: string
  module: number
  page: string
  questionHtml: string
  exhibits: Exhibit[]
  options: CardOption[]
  answer: string
  explanationHtml: string
}

export interface Deck {
  id: string
  title: string
  description: string
  modules: string[]
  cards: Card[]
}
