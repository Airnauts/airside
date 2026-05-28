export const DEFAULT_WEIGHTS = {
  stableAttrs: 0.4,
  text: 0.25,
  classes: 0.15,
  role: 0.1,
  sibling: 0.05,
  ancestor: 0.05,
} as const

export type WeightKey = keyof typeof DEFAULT_WEIGHTS

export const DEFAULT_THRESHOLDS = {
  accept: 0.6,
  margin: 0.1,
} as const

export type Thresholds = { accept: number; margin: number }
