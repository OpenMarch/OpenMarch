# OpenMarch Database

OpenMarch uses [Drizzle ORM](https://orm.drizzle.team/) to manage its SQLite database schema and migrations.

Whenever you need to change the database structure (such as adding or modifying tables or columns), you must update the schema in `schema.ts` and create a new migration to reflect those changes.

After changing the file, run this command

```bash
# in ./apps/desktop
pnpm run migrate
```

## Double check the new schema

If you added or modified columns in existing tables, you may need to manually edit the generated `.sql` file.
I.e. if I add a column `last_name` to the `marchers` table, the new migration sql may try to copy that value from the old table, even though it doesn't exist.
This will cause `SQLITE no such column` errors if not fixed.

**VERY IMPORTANT** - Check that the new database actually works - Launch OpenMarch via `pnpm run dev` and try to open an old `.dots` file - Validate no errors are thrown

## Pushing changes

Coordinating database schema changes are a bit of a challenge, since drizzle expects a complete linear history of migrations.

If you'd like to modify or add to the database schema, please make this clear in your pull request so that we can take extra care in merging those changes.

## Files saved by fork builds

Migrations `0000` to `0016` are upstream's and must stay byte-identical. `0017_timeline_model`
collapses the fork's old migrations 0017 to 0032, and `0018_drop_page_era` drops the page-era
tables after a page-era file's conversion has read them
([ADR 0011](../../../../../docs/adr/0011-collapse-fork-migrations.md)).

Files that fork builds saved still record the old migrations. They are repaired when they open
(`../legacyFork/legacyForkRepair.ts`), from a frozen copy of the old SQL
(`../legacyFork/legacyForkMigrations.ts`). Never edit that copy. A new migration that changes a
table `0017_timeline_model` makes needs no change to the repair: it runs after it, like on any
other file.
