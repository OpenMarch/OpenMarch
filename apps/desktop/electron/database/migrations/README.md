# OpenMarch Database

OpenMarch uses Drizzle ORM to manage its SQLite database schema and migrations.
Whenever you need to change the database structure (such as adding or modifying tables or columns), you must update the schema in `schema.ts` and create a new migration to reflect those changes

After changing the file, run `pnpm drizzle-kit generate`
