import { reorderFixtures } from './reorder.fixtures'
import type { AnchorFixture } from './types'
import { wrapperFixtures } from './wrapper.fixtures'

export const allFixtures: AnchorFixture[] = [...wrapperFixtures, ...reorderFixtures]
