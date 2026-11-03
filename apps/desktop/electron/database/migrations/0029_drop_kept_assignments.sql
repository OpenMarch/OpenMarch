-- Kept spots are removed (ADR 0001 amendment 2026-10-29). A stored undo or redo step that names
-- the kept table would fail with "no such table" once it is dropped, so a file whose history names
-- it gets both stacks cleared (owner, 2026-10-28). Each statement reads the stacks as they are
-- then: redo goes first when undo names the table, undo next when either does, then redo when it
-- does.
UPDATE `history_stats` SET `cur_undo_group` = 1, `cur_redo_group` = 1 WHERE EXISTS (SELECT 1 FROM `history_undo` WHERE instr(`sql`, 'timeline_kept_assignments') > 0) OR EXISTS (SELECT 1 FROM `history_redo` WHERE instr(`sql`, 'timeline_kept_assignments') > 0);--> statement-breakpoint
DELETE FROM `history_redo` WHERE EXISTS (SELECT 1 FROM `history_undo` WHERE instr(`sql`, 'timeline_kept_assignments') > 0);--> statement-breakpoint
DELETE FROM `history_undo` WHERE EXISTS (SELECT 1 FROM `history_undo` WHERE instr(`sql`, 'timeline_kept_assignments') > 0) OR EXISTS (SELECT 1 FROM `history_redo` WHERE instr(`sql`, 'timeline_kept_assignments') > 0);--> statement-breakpoint
DELETE FROM `history_redo` WHERE EXISTS (SELECT 1 FROM `history_redo` WHERE instr(`sql`, 'timeline_kept_assignments') > 0);--> statement-breakpoint
DROP TABLE `timeline_kept_assignments`;
