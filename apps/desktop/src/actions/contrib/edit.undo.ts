import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../types";
import { ActionRegistry } from "../registry";

class PerformUndoCommand implements ActionCommand<void> {
  async canExecute(ctx: ActionContext) {
    return await ctx.history.canUndo();
  }
  async execute(ctx: ActionContext) {
    try {
      await ctx.history.undo();
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
