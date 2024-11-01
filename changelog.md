# 0.0.4 - New UI and Database

## Features

### New UI

Thanks to the hard work of [dukc](https://github.com/dukcc), the UI has a new modern look.
The new interface also brings the following:

- Dark and light mode
- Turning popup windows into side lists (so the user can still edit the canvas)
- Ability to collapse the sidebar inspectors
- A measure/page timeline that is actually readable
- An overall better place to spend your time

### Undo and Redo

Essentially everything that modifies the database can be undone and restored.
Before, only the editing of Marchers, Pages, and MarcherPages were part of the history stack.
Now you can do the following:

- Undo and redo the creation, modification, and deletion of rows in every table
  - Marchers
  - Pages
  - MarcherPages
  - FieldProperties
  - Audio
  - Measures
- There is now a limit to how many actions are saved so the file doesn't take up infinite storage
  - Default is 500 actions

## Quality of life

- The first page now always exists and cannot be deleted
  - There was no reason for a user to make a 0-count page, as page 1 will always exist
- The canvas shows up immediately on launch (thanks to the implementation of the permanent page 1)

## Dev

### UI

- Standard components using [Radix](https://www.radix-ui.com/)
- Unified variables with tailwind

### Database

- `DatabaseActions.ts` - Standard database interactions
  - Rather than trying to force `TableController` objects, I've made a collection of functions in a file called `DatabaseActions` which standardize interactions with the database.
  - The decision to go functional as opposed to object-oriented was due to the hyper-customization each table needed in its own case.
- History triggers
  - All actions performed on the database are automatically recorded using triggers at the SQLite level
  - To add a table to the history stack, call `createUndoTriggers(db, tableName)` from `database.history.ts`
