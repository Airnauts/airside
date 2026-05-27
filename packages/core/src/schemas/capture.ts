import { z } from 'zod'

export const CaptureContext = z
  .object({
    viewportW: z.number().int().positive(),
    viewportH: z.number().int().positive(),
    devicePixelRatio: z.number().positive(),
    userAgent: z.string(),
  })
  .meta({ id: 'CaptureContext' })
export type CaptureContext = z.infer<typeof CaptureContext>

export const Provenance = z
  .object({
    commitSha: z.string().optional(),
    branch: z.string().optional(),
    deploymentId: z.string().optional(),
  })
  .meta({ id: 'Provenance' })
export type Provenance = z.infer<typeof Provenance>
