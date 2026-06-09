import { z } from 'zod'

export const ExtensionSlot = z.enum(['thread-toolbar', 'thread-metadata', 'panel-row-actions'])
export type ExtensionSlot = z.infer<typeof ExtensionSlot>

/** A server-evaluated, currently-renderable action. Contains no executable code. */
export const ThreadActionDescriptor = z
  .object({
    id: z.string(),
    provider: z.string(),
    label: z.string(),
    slot: ExtensionSlot,
    presentation: z
      .object({
        icon: z.string().optional(),
        style: z.enum(['primary', 'secondary', 'link']).optional(),
      })
      .optional(),
  })
  .meta({ id: 'ThreadActionDescriptor' })
export type ThreadActionDescriptor = z.infer<typeof ThreadActionDescriptor>
