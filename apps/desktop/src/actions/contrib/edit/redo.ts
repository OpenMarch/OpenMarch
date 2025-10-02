import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../../types";
import { ActionRegistry } from "../../registry";

class PerformRedoCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    if (!ctx.queries.canRedo) {
      ctx.toast?.warning?.(ctx.t("actions.edit.noRedoAvailable"));
      return false;
    }
    return true;
  }
  execute(ctx: ActionContext) {
    try {
      ctx.mutations.performHistoryAction("redo");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }
}

export const registerPerformRedo = (registry: ActionRegistry) => {
  const meta: ActionMeta = {
    id: ActionId.performRedo,
    descKey: "actions.edit.redo",
    shortcuts: [{ key: "z", ctrl: true, shift: true }],
    category: "edit",
  };
  registry.register(meta, () => new PerformRedoCommand());
};
