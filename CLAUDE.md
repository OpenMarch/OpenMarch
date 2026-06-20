# Claude Development Notes

This file contains important context and learnings for AI assistants working on the OpenMarch codebase.

## Repository Structure

- **Monorepo**: Uses pnpm workspaces with `apps/desktop` (main Electron app) and `apps/website` (Astro docs site)
- **Main development**: Focus is on `apps/desktop/` - an Electron-based drill writing application
- **Testing**: Uses Vitest for unit tests, Playwright for e2e tests
- **Build system**: pnpm scripts, no explicit typecheck script (use `pnpm tsc --noEmit`)

## Development Workflow

- **Commits**: Use descriptive messages ending with Claude attribution
- **Pre-commit**: Runs eslint, prettier, cspell automatically
- **Linting**: `pnpm lint` in desktop app directory
- **Type checking**: `pnpm tsc --noEmit` in desktop app directory

## Key Architecture Patterns

### Database Layer

- **Undo/Redo system**: Uses `useNextUndoGroup` parameter to control transaction grouping
- **Transaction pattern**: GroupFunction for multi-operation transactions with rollback
- **Migration to shared SQL bridge**: Moving from IPC-based database calls to Drizzle remote SQLite driver for renderer process access (enables future in-browser version)

### Code Organization

- **Database functions**: Located in `electron/database/tables/` (legacy IPC-based) OR consolidated in `src/global/classes/` (new shared SQL bridge pattern)
- **Business logic**: Classes in `src/global/classes/`
- **UI utilities**: Helper functions often co-located with components
- **Testing**: Test files use `.test.ts` suffix, mocks in `__mocks__/`

## Common Gotchas

- **Response handling**: GroupFunction returns `{responses: [], success: boolean}`, direct DB calls return `DatabaseResponse<T>`
- **Async refresh**: Some refresh functions are async, others aren't - check call sites
- **Import paths**: Uses `@/` alias for `src/` directory
- **File paths**: Always use absolute paths for file operations, not relative

## Performance Notes

- **Database operations**: Prefer single transactions over multiple calls
- **UI updates**: Batch refresh operations where possible
- **Search operations**: Use Grep/Glob tools instead of bash find/grep commands

## Database Table Migration Guide

This guide explains how to migrate a database table from the legacy IPC bridge pattern to the new shared SQL bridge pattern, following the successful MeasureTable → Measure.ts migration.

### Migration Overview

**Goal**: Move database operations from main process (IPC calls) to renderer process (shared SQL bridge) to enable future in-browser version.

**Pattern**: Follow FieldProperties.ts example - consolidate everything into a single file in `src/global/classes/`

### Step-by-Step Migration Process

#### 1. **Examine Current Implementation**

- Read the legacy `electron/database/tables/[Table]Table.ts` file
- Understand the existing IPC-based CRUD operations
- Note the database types and interfaces used
- Check the corresponding test file

#### 2. **Create Generic Adapter (if not exists)**

The `promiseToDatabaseResponse` adapter in `src/global/database/adapters.ts` converts `Promise<T>` to `DatabaseResponse<T>` for GroupFunction compatibility.

#### 3. **Consolidate into Single File**

Create/update `src/global/classes/[Entity].ts` with:

**Database Types (using Drizzle inference):**

```typescript
export type DatabaseEntity = typeof entityTable.$inferSelect;
export type NewEntityArgs = Omit<
  typeof entityTable.$inferInsert,
  "id" | "created_at" | "updated_at"
>;
export type ModifiedEntityArgs = Partial<typeof entityTable.$inferInsert> & {
  id: number;
};
```

**Internal Database Functions (return raw data):**

```typescript
export async function createEntityDb(
  newEntities: NewEntityArgs[],
): Promise<DatabaseEntity[]> {
  return await db.transaction(async (tx) => {
    await incrementUndoGroup(tx);
    // ... implementation
  });
}
```

**Public Wrapper Functions (apply DatabaseResponse wrapper):**

```typescript
export const createEntities = async (
  entities: NewEntityArgs[],
  fetchFunction: () => Promise<void>,
): Promise<DatabaseResponse<DatabaseEntity[]>> => {
  const response = await promiseToDatabaseResponse(() =>
    createEntityDb(entities),
  );
  if (response.success) fetchFunction();
  else console.error("Failed to create entities", response.error);
  return response;
};
```

#### 4. **Update All Imports**

- Find all files importing from `electron/database/tables/[Table]Table`
- Update imports to use `src/global/classes/[Entity]`
- Update import names if functions were renamed

#### 5. **Remove IPC Bridge Code**

- Remove import in `electron/database/database.services.ts`
- Remove IPC handlers (`ipcMain.handle` calls)
- Remove IPC calls from `electron/preload/index.ts`

#### 6. **Consolidate Test Files**

- Merge `electron/database/tables/__test__/[Table]Table.test.ts` into `src/global/classes/__test__/[Entity].test.ts`
- Update test imports to use internal `*Db` functions (which return raw data)
- Ensure tests create necessary foreign key dependencies first
- Use `setupTestSqlProxy()` in beforeEach

#### 7. **Verify Migration**

- Run `pnpm tsc --noEmit` to check TypeScript compilation
- Run tests: `pnpm test --run [Entity].test`
- Run linter: `pnpm lint`

#### 8. **Clean Up Legacy Files**

- Delete `electron/database/tables/[Table]Table.ts`
- Delete `electron/database/tables/__test__/[Table]Table.test.ts`
- Final verification that nothing imports from deleted files

### Key Patterns to Follow

#### Function Structure

- **Internal functions**: `*Db()` suffix, return raw data types
- **Public wrappers**: Same name as before, apply `DatabaseResponse` wrapper
- **Public getters**: Can return `DatabaseResponse` directly for read operations

#### Type Definitions

- **Always use Drizzle inferred types**: `typeof table.$inferSelect` etc.
- **Never manually define interfaces** that duplicate schema information
- **Omit auto-generated fields** (id, timestamps) from `NewEntityArgs`

#### Test Structure

- **Test internal `*Db` functions**: Expect raw data arrays, not `DatabaseResponse`
- **Test public wrapper functions**: Expect `DatabaseResponse` format
- **Setup dependencies**: Create foreign key references before testing

#### Import Organization

```typescript
// Domain logic imports
import Entity, { fromDatabaseEntities } from "./Entity";

// Database imports
import { db, schema } from "../database/db";
import { eq, inArray } from "drizzle-orm";
import { incrementUndoGroup } from "./History";
import { promiseToDatabaseResponse } from "../database/adapters";

const { entityTable } = schema;
```

### Migration Benefits

- **Type safety**: Schema changes automatically propagate to TypeScript types
- **Performance**: Eliminates IPC overhead for database operations
- **Future-ready**: Enables in-browser version using same codebase
- **Maintainability**: Single file contains all entity-related functionality
- **Consistency**: Follows established FieldProperties pattern

### Migration Dependencies

Tables should be migrated in dependency order (references first):

1. FieldProperties ✅ (already migrated)
2. Measures ✅ (already migrated)
3. Beats (references measures)
4. Pages (references beats)
5. Marchers (independent)
6. MarcherPages (references marchers + pages)
7. etc.
