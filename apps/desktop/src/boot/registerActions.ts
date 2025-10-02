import { ActionRegistry } from "../actions/registry";

// Edit actions
import { registerPerformUndo } from "../actions/contrib/edit/undo";
import { registerPerformRedo } from "../actions/contrib/edit/redo";

// Alignment actions
import { registerToggleLockX } from "../actions/contrib/align/lockX";
import { registerToggleLockY } from "../actions/contrib/align/lockY";
import { registerAlignmentOps } from "../actions/contrib/align/operations";

// Navigation & Playback
import { registerNavPages } from "../actions/contrib/nav/pages";
import { registerPlayback } from "../actions/contrib/playback/playback";

// UI toggles
import { registerUIToggles } from "../actions/contrib/ui/toggles";

// File operations
import { registerElectronFileOps } from "../actions/contrib/file/electron";

// Batch editing
import { registerBatchCopyPositions } from "../actions/contrib/batch/copyPositions";

// Movement
import { registerMovement } from "../actions/contrib/movement/move";

// Cursor mode
import { registerCursorMode } from "../actions/contrib/cursor/shapeMode";

// Selection
import { registerSelection } from "../actions/contrib/selection/selectAll";

export const registerAllActions = (registry: ActionRegistry) => {
  // Edit actions
  registerPerformUndo(registry);
  registerPerformRedo(registry);
  
  // Alignment actions
  registerToggleLockX(registry);
  registerToggleLockY(registry);
  registerAlignmentOps(registry);
  
  // Navigation actions
  registerNavPages(registry);
  registerPlayback(registry);
  
  // UI toggles
  registerUIToggles(registry);
  
  // File operations
  registerElectronFileOps(registry);
  
  // Batch editing
  registerBatchCopyPositions(registry);
  
  // Movement
  registerMovement(registry);
  
  // Cursor mode
  registerCursorMode(registry);
  
  // Selection
  registerSelection(registry);
};
