import * as migration_20250929_111647 from './20250929_111647'
import * as migration_20260130_052409 from './20260130_052409'

export const migrations = [
  {
    up: migration_20250929_111647.up,
    down: migration_20250929_111647.down,
    name: '20250929_111647',
  },
  {
    up: migration_20260130_052409.up,
    down: migration_20260130_052409.down,
    name: '20260130_052409',
  },
]
