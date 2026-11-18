/**
 * Status `setDbPath` returns when a leftover journal next to the file can't be used
 * (`leftoverJournal.ts`). 423 is HTTP "Locked"; the renderer offers to open the show without
 * the journal. In its own module so the renderer can import it without `fs`.
 */
export const LEFTOVER_JOURNAL_STATUS = 423;
