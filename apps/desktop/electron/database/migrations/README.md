# OpenMarch Database

OpenMarch uses [Drizzle ORM](https://orm.drizzle.team/) to manage its SQLite database schema and migrations.

Whenever you need to change the database structure (such as adding or modifying tables or columns), you must update the schema in `schema.ts` and create a new migration to reflect those changes.

After changing the file, run this command

```bash
# in ./apps/desktop
pnpm run migrate
```

## Pushing changes

Coordinating database schema changes are a bit of a challenge, since drizzle expects a complete linear history of migrations.

If you'd like to modify or add to the database schema, please make this clear in your pull request so that we can take extra care in merging those changes.
