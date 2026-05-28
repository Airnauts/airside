import { attrFixtures } from './attr.fixtures'
import { removeFixtures } from './remove.fixtures'
import { renameFixtures } from './rename.fixtures'
import { reorderFixtures } from './reorder.fixtures'
import { textFixtures } from './text.fixtures'
import type { AnchorFixture } from './types'
import { wrapperFixtures } from './wrapper.fixtures'

export const allFixtures: AnchorFixture[] = [
  ...wrapperFixtures,
  ...reorderFixtures,
  ...renameFixtures,
  ...textFixtures,
  ...attrFixtures,
  ...removeFixtures,
]
