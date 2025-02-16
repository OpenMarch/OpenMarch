# Creating new database versions

This folder contains the OpenMarch migration system.
When you want to modify the database's schema, or are modifying the makeup objects like `field_properties` you must.
create a new database version.
This allows files created with older versions of OpenMarch to still be used and be compatible with the new version.

This folder contains:

- `DatabaseMigrator.ts` - The main class that handles the migration process.
- `v{x}.ts` - The migration file for the version.
- `__test__/v{x}.test.ts` - The test file for the migration.

## How it works

When OpenMarch launches, it will check the `user_version` pragma in the database.
After which, the following will happen depending on the version:

- If `user_version == expected_version`
  - The database is up to date
  - No migration is needed.
- If `user_version == expected_version - 1`
  - The database is one version behind
  - The migration will be run from the previous version
- If `user_version < expected_version - 1`
  - The database is more than one version behind
  - The migration will travel up the migration chain until it reaches the expected version.
  - E.g. If we start with 2 and are expecting 5. `2 -> 3 ; 3 -> 4 ; 4 -> 5`

## How to create a new migration

1. Create a new file in the `electron/database/versions` folder with the name `v{x}.ts` where `x` is the version number.
   1. E.g. `v8.ts`
1. Add the following boilerplate to the file:

   ```ts
   // Import the previous version
   import v7 from "./v7";
   import Database from "better-sqlite3";

   // Extend the previous version
   export default class v8 extends v7 {
     get version() {
       // The version number of the migration
       return 8;
     }

     migrateToThisVersion(db: Database.Database) {
       const dbToUse = db ? db : this.databaseConnector();
       if (!dbToUse) throw new Error("Failed to connect to database.");

       if (!this.isThisVersion(dbToUse)) {
         this.migrationWrapper(() => {
           // Do migration stuff here
         });
       } else {
         console.log("Database version is up-to-date. Not migrating");
       }
     }

     // If you need to create new tables, add them here
     createTables(version: number) {
       // Create all of the tables for the older versions
       super.createTables(version);

       // Define the new tables here
     }
   }
   ```

   1. Define your migrations in the newly created file

1. Create a test file in the `__test__` folder with the name `v{x}.test.ts` where `x` is the version number.
   1. Test your migrations in the newly created test file
1. Update the import in `electron/main/index.ts` to reference the new database version

   ```ts
   // ./electron/main/index.ts

   // Define version 8
   import * as DatabaseMigrator from "../database/versions/v8";
   ```
