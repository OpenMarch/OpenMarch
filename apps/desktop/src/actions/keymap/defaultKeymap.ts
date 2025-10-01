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
  
  // Navigation
  "e": ActionId.nextPage,
  "q": ActionId.previousPage,
  "S-e": ActionId.lastPage,
  "S-q": ActionId.firstPage,
  " ": ActionId.playPause,
  "C-m": ActionId.toggleMetronome,
  
  // UI toggles
  "n": ActionId.togglePreviousPagePaths,
  "m": ActionId.toggleNextPagePaths,
  "A-c": ActionId.focusCanvas,
  "A-t": ActionId.focusTimeline,
  
  // TODO: Add remaining shortcuts:
  // - Batch editing (Ctrl+Shift+P, Shift+P, Ctrl+Shift+N, Shift+N)
  // - Alignment operations (1, Alt+V, Alt+H, Shift+V, Shift+H, Ctrl+S)
  // - Cursor mode (Enter, Shift+Enter, Delete, Escape, V, L)
  // - Selection (Ctrl+A)
};

export const holdableActions = new Set<ActionId>([
  // TODO: Add movement actions when implemented:
  // ActionId.moveSelectedMarchersUp,
  // ActionId.moveSelectedMarchersDown,
  // ActionId.moveSelectedMarchersLeft,
  // ActionId.moveSelectedMarchersRight,
]);
