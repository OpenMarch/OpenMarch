import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../../types";
import { ActionRegistry } from "../../registry";

class SelectAllMarchersCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.queries.marcherPages && Object.keys(ctx.queries.marcherPages).length > 0;
  }
  execute(ctx: ActionContext) {
    if (!ctx.queries.marcherPages) {
      return { ok: false, error: new Error("No marcher pages available") };
    }

    const allMarchers = Object.values(ctx.queries.marcherPages).map((mp: any) => ({
      id: mp.marcher_id,
      id_for_html: mp.marcher_id.toString(),
      drill_prefix: "",
      drill_order: 0,
      section: "",
      year: "",
      notes: "",
      // Add other required marcher properties from your Marcher type
    }));

    ctx.selection.setSelectedMarchers(allMarchers);
    return { ok: true };
  }
}

export const registerSelection = (registry: ActionRegistry) => {
  registry.register(
    {
      id: ActionId.selectAllMarchers,
      descKey: "actions.select.selectAll",
      shortcuts: [{ key: "a", ctrl: true }],
      category: "selection",
    },
    () => new SelectAllMarchersCommand()
  );
};
