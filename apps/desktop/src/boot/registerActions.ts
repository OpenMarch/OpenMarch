import { ActionRegistry } from "../actions/registry";
import { registerPerformUndo } from "../actions/contrib/edit.undo";
import { registerToggleLockX } from "../actions/contrib/align.lockX";
// import and register others as you migrate

export const registerAllActions = (registry: ActionRegistry) => {
  registerPerformUndo(registry);
  registerToggleLockX(registry);
  // registerNewThing(registry);
};
