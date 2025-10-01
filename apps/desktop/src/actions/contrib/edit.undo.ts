import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../types";
import { ActionRegistry } from "../registry";

class PerformUndoCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    if (!ctx.queries.canUndo) {
      ctx.toast?.warning?.(ctx.t("actions.edit.noUndoAvailable"));
      return false;
    }
    return true;
  }
  execute(ctx: ActionContext) {
    try {
      ctx.mutations.performHistoryAction("undo");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }
}

export const registerPerformUndo = (registry: ActionRegistry) => {
  const meta: ActionMeta = {
    id: ActionId.performUndo,
    descKey: "actions.edit.undo",
    shortcuts: [{ key: "z", ctrl: true }],
    category: "edit",
  };
  registry.register(meta, () => new PerformUndoCommand());
};
