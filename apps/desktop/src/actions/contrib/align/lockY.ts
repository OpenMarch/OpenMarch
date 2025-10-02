import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../../types";
import { ActionRegistry } from "../../registry";

class ToggleLockYCommand implements ActionCommand<void> {
  isToggled(ctx: ActionContext) {
    return !!ctx.selection.constraints.lockY;
  }
  execute(ctx: ActionContext) {
    const prev = !!ctx.selection.constraints.lockY;
    ctx.selection.setConstraints({ lockY: !prev });
    return { ok: true };
  }
}

export const registerToggleLockY = (registry: ActionRegistry) => {
  const meta: ActionMeta = {
    id: ActionId.lockY,
    descKey: "actions.alignment.lockY",
    toggleOnKey: "actions.alignment.lockYOn",
    toggleOffKey: "actions.alignment.lockYOff",
    shortcuts: [{ key: "x" }],
    category: "align",
  };
  registry.register(meta, () => new ToggleLockYCommand());
};
