import { ActionRegistry } from "../actions/registry";
import { registerPerformUndo } from "../actions/contrib/edit.undo";
import { registerPerformRedo } from "../actions/contrib/edit.redo";
import { registerToggleLockX } from "../actions/contrib/align.lockX";
import { registerToggleLockY } from "../actions/contrib/align.lockY";
import { registerNavPages } from "../actions/contrib/nav.pages";
import { registerPlayback } from "../actions/contrib/playback";
import { registerUIToggles } from "../actions/contrib/ui.toggles";
// import and register others as you migrate

export const registerAllActions = (registry: ActionRegistry) => {
  // Edit actions
  registerPerformUndo(registry);
  registerPerformRedo(registry);
  
  // Alignment actions
  registerToggleLockX(registry);
  registerToggleLockY(registry);
  
  // Navigation actions
  registerNavPages(registry);
  registerPlayback(registry);
  
  // UI toggles
  registerUIToggles(registry);
  
  // TODO: Add remaining actions:
  // - Electron file operations
  // - Batch editing
  // - Alignment operations (align, distribute, snap, swap)
  // - Movement (WASD/arrows)
  // - Cursor mode
  // - Selection
};
