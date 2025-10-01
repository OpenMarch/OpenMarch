import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../types";
import { ActionRegistry } from "../registry";

class ToggleLockXCommand implements ActionCommand<void> {
  isToggled(ctx: ActionContext) {
    return !!ctx.selection.constraints.lockX;
  }
  execute(ctx: ActionContext) {
    const prev = !!ctx.selection.constraints.lockX;
    ctx.selection.setConstraints({ lockX: !prev });
    return { ok: true };
  }
  getInverse(ctx: ActionContext) {
    const prev = !!ctx.selection.constraints.lockX;
    return new (class implements ActionCommand<void> {
      execute(ctx2: ActionContext) {
        ctx2.selection.setConstraints({ lockX: prev });
        return { ok: true };
      }
    })();
  }
}

export const registerToggleLockX = (registry: ActionRegistry) => {
  const meta: ActionMeta = {
    id: ActionId.lockX,
    descKey: "actions.alignment.lockX",
    toggleOnKey: "actions.alignment.lockXOn",
    toggleOffKey: "actions.alignment.lockXOff",
    shortcuts: [{ key: "y" }],
    category: "align",
  };
  registry.register(meta, () => new ToggleLockXCommand());
};
