# Upstream mobile exports of the v0.1.7 shows

What upstream OpenMarch exports to the mobile app for each v0.1.7 show in
`electron/database/__test__/v017-files/`. `../dots-to-om.upstream.test.ts` exports the same
shows from this build and compares (docs/convergence/inventory.md R1).

| File                      | What it is                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `<name>.upstream-om.json` | `toOpenMarchSchema` of upstream main c9784b34a, on `<name>.dots` after upstream's own migrations. |

## How they were made

In a worktree of upstream `main` (c9784b34a), after `pnpm install` and building `packages/*`, this
test was added as `apps/desktop/src/components/mobile/utilities/__test__/upstreamExport.test.ts`
and run with `P6_FIXTURES=<this repo>/apps/desktop/electron/database/__test__/v017-files
P6_OUT=<out dir> npx vitest run <that file>` from `apps/desktop`:

```ts
import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import fs from "fs";
import os from "os";
import path from "path";
import { schema } from "@/test/base";
import { handleSqlProxyWithDbBetterSqlite } from "@/test/sqlProxyTestUtil";
import { DrizzleMigrationService } from "../../../../../electron/database/services/DrizzleMigrationService";
import type { DB } from "@/global/database/db";
import { toOpenMarchSchema } from "../dots-to-om";

const SRC = process.env.P6_FIXTURES!;
const OUT = process.env.P6_OUT!;

for (const name of ["small", "realistic"]) {
  it(`exports ${name}`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p6-up-"));
    const file = path.join(dir, `${name}.dots`);
    fs.copyFileSync(path.join(SRC, `${name}.dots`), file);
    const raw = new DatabaseSync(file);
    const db = drizzle(
      async (sql, params, method) =>
        handleSqlProxyWithDbBetterSqlite(raw, sql, params, method),
      { schema, casing: "snake_case" },
    );
    await new DrizzleMigrationService(
      db as unknown as never,
      raw,
    ).applyPendingMigrations(
      path.resolve(__dirname, "../../../../../electron/database/migrations"),
    );
    const out = await toOpenMarchSchema(db as unknown as DB);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(
      path.join(OUT, `${name}.upstream-om.json`),
      JSON.stringify(out, null, 1) + "\n",
    );
    raw.close();
    expect(out.pages.length).toBeGreaterThan(0);
  });
}
```

Then `prettier --write` formatted them. `createdAtUtc` comes from the first beat's timestamp (0), so a rerun writes the same files.

## Not covered

The v0.1.7 files have no marcher rotation and no per-page appearance in `marcher_pages`
(see `v017-files/README.md`). Upstream exports both; this build drops them when it converts a
show (`timeline/convert/planPageConversion.ts`), so they never reach its export.
