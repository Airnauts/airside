export type MutationClass =
  | 'wrapper'
  | 'reorder'
  | 'rename'
  | 'text'
  | 'attr'
  | 'remove'
  | 'duplicate'

export type AnchorFixture = {
  name: string
  mutationClass: MutationClass
  beforeHtml: string
  afterHtml: string
  targetInBefore: string
  selection?: { quote: string; prefix: string; suffix: string }
  expected:
    | { kind: 'anchored'; targetInAfter: string; selectionLost?: boolean }
    | {
        kind: 'orphaned'
        reason: 'noCandidates' | 'belowAccept' | 'ambiguous'
      }
  notes?: string
}
