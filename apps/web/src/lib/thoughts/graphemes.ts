/**
 * `Intl.Segmenter`, not `.length` — a 140-*character* cap on a JS string counts UTF-16
 * code units, which splits emoji and combining marks (Thai vowel signs, Japanese) into
 * more than one "character" each. Graphemes are what a person actually typed.
 */

const MAX_GRAPHEMES = 140
let segmenter: Intl.Segmenter | null = null

function getSegmenter(): Intl.Segmenter {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return segmenter
}

function graphemes(text: string): string[] {
  return Array.from(getSegmenter().segment(text), (s) => s.segment)
}

export function graphemeCount(text: string): number {
  return graphemes(text).length
}

export function truncateGraphemes(text: string, max: number = MAX_GRAPHEMES): string {
  const g = graphemes(text)
  return g.length <= max ? text : g.slice(0, max).join('')
}

export { MAX_GRAPHEMES }
