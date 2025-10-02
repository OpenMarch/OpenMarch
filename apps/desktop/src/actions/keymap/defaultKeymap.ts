import { ActionId } from "../types";
import type { Keymap } from "./keymap.service";

// platform-neutral starter; branch by process.platform if needed
export const defaultKeymap: Keymap = {
  // Edit
  "C-z": ActionId.performUndo,
  "C-S-z": ActionId.performRedo,
  
  // Alignment toggles
  "y": ActionId.lockX,
  "x": ActionId.lockY,
  
  // Alignment operations
  "1": ActionId.snapToNearestWhole,
  "A-v": ActionId.alignVertically,
  "A-h": ActionId.alignHorizontally,
  "S-v": ActionId.evenlyDistributeVertically,
  "S-h": ActionId.evenlyDistributeHorizontally,
  "C-s": ActionId.swapMarchers,
  
  // Navigation
  "e": ActionId.nextPage,
  "q": ActionId.previousPage,
  "S-e": ActionId.lastPage,
  "S-q": ActionId.firstPage,
  " ": ActionId.playPause,
  "C-m": ActionId.toggleMetronome,
  
  // Batch editing
  "C-S-p": ActionId.setAllMarchersToPreviousPage,
  "S-p": ActionId.setSelectedMarchersToPreviousPage,
  "C-S-n": ActionId.setAllMarchersToNextPage,
  "S-n": ActionId.setSelectedMarchersToNextPage,
  
  // UI toggles
  "n": ActionId.togglePreviousPagePaths,
  "m": ActionId.toggleNextPagePaths,
  "A-c": ActionId.focusCanvas,
  "A-t": ActionId.focusTimeline,
  
  // Cursor mode
  "Enter": ActionId.createMarcherShape,
  "S-Enter": ActionId.applyQuickShape,
  "Delete": ActionId.deleteMarcherShape,
  "Escape": ActionId.cancelAlignmentUpdates,
  "v": ActionId.alignmentEventDefault,
  "l": ActionId.alignmentEventLine,
  
  // Selection
  "C-a": ActionId.selectAllMarchers,
  
  // Note: WASD and Arrow keys for movement are handled specially in bindKeyboard
  // to support both single-key and holdable behavior
};

export const holdableActions = new Set<ActionId>([
  ActionId.moveSelectedMarchersUp,
  ActionId.moveSelectedMarchersDown,
  ActionId.moveSelectedMarchersLeft,
  ActionId.moveSelectedMarchersRight,
]);
