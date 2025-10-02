import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../../types";
import { ActionRegistry } from "../../registry";

class MoveUpCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.selection.selectedMarchers.length > 0;
  }
  execute(ctx: ActionContext) {
    const selectedMarcherPages = ctx.selection.getSelectedMarcherPages();
    if (selectedMarcherPages.length === 0) {
      return { ok: false, error: new Error("No marchers selected") };
    }

    const changes = selectedMarcherPages.map((mp: any) => ({
      marcher_id: mp.marcher_id,
      page_id: mp.page_id,
      x: mp.x as number,
      y: (mp.y as number) - 1,
      notes: mp.notes,
    }));

    ctx.mutations.updateMarcherPages(changes);
    return { ok: true };
  }
}

class MoveDownCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.selection.selectedMarchers.length > 0;
  }
  execute(ctx: ActionContext) {
    const selectedMarcherPages = ctx.selection.getSelectedMarcherPages();
    if (selectedMarcherPages.length === 0) {
      return { ok: false, error: new Error("No marchers selected") };
    }

    const changes = selectedMarcherPages.map((mp: any) => ({
      marcher_id: mp.marcher_id,
      page_id: mp.page_id,
      x: mp.x as number,
      y: (mp.y as number) + 1,
      notes: mp.notes,
    }));

    ctx.mutations.updateMarcherPages(changes);
    return { ok: true };
  }
}

class MoveLeftCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.selection.selectedMarchers.length > 0;
  }
  execute(ctx: ActionContext) {
    const selectedMarcherPages = ctx.selection.getSelectedMarcherPages();
    if (selectedMarcherPages.length === 0) {
      return { ok: false, error: new Error("No marchers selected") };
    }

    const changes = selectedMarcherPages.map((mp: any) => ({
      marcher_id: mp.marcher_id,
      page_id: mp.page_id,
      x: (mp.x as number) - 1,
      y: mp.y as number,
      notes: mp.notes,
    }));

    ctx.mutations.updateMarcherPages(changes);
    return { ok: true };
  }
}

class MoveRightCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.selection.selectedMarchers.length > 0;
  }
  execute(ctx: ActionContext) {
    const selectedMarcherPages = ctx.selection.getSelectedMarcherPages();
    if (selectedMarcherPages.length === 0) {
      return { ok: false, error: new Error("No marchers selected") };
    }

    const changes = selectedMarcherPages.map((mp: any) => ({
      marcher_id: mp.marcher_id,
      page_id: mp.page_id,
      x: (mp.x as number) + 1,
      y: mp.y as number,
      notes: mp.notes,
    }));

    ctx.mutations.updateMarcherPages(changes);
    return { ok: true };
  }
}

export const registerMovement = (registry: ActionRegistry) => {
  registry.register(
    {
      id: ActionId.moveSelectedMarchersUp,
      descKey: "actions.movement.moveUp",
      // Note: WASD/Arrow keys handled specially in keyboard handler
      category: "edit",
      holdable: true,
    },
    () => new MoveUpCommand()
  );

  registry.register(
    {
      id: ActionId.moveSelectedMarchersDown,
      descKey: "actions.movement.moveDown",
      category: "edit",
      holdable: true,
    },
    () => new MoveDownCommand()
  );

  registry.register(
    {
      id: ActionId.moveSelectedMarchersLeft,
      descKey: "actions.movement.moveLeft",
      category: "edit",
      holdable: true,
    },
    () => new MoveLeftCommand()
  );

  registry.register(
    {
      id: ActionId.moveSelectedMarchersRight,
      descKey: "actions.movement.moveRight",
      category: "edit",
      holdable: true,
    },
    () => new MoveRightCommand()
  );
};
