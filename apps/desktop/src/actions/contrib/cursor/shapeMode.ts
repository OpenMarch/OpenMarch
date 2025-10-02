import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../../types";
import { ActionRegistry } from "../../registry";

class ApplyQuickShapeCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.alignment.newMarcherPages.length > 0;
  }
  execute(ctx: ActionContext) {
    if (ctx.alignment.newMarcherPages.length === 0) {
      return { ok: false, error: new Error("No shape to apply") };
    }

    const changes = ctx.alignment.newMarcherPages.map((mp: any) => ({
      marcher_id: mp.marcher_id,
      page_id: mp.page_id,
      x: mp.x as number,
      y: mp.y as number,
      notes: mp.notes,
    }));

    ctx.mutations.updateMarcherPages(changes);
    ctx.alignment.reset();
    return { ok: true };
  }
}

class CreateMarcherShapeCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.alignment.marchers.length > 0;
  }
  execute(ctx: ActionContext) {
    if (ctx.alignment.marchers.length === 0) {
      return { ok: false, error: new Error("No marchers for shape") };
    }

    ctx.mutations.createMarcherShape({
      marchers: ctx.alignment.marchers,
      // Additional data from alignment event
    });
    ctx.alignment.reset();
    return { ok: true };
  }
}

class DeleteMarcherShapeCommand implements ActionCommand<void> {
  execute(ctx: ActionContext) {
    // Implementation would delete the current shape
    // For now, just reset alignment event
    ctx.alignment.reset();
    return { ok: true };
  }
}

class CancelAlignmentUpdatesCommand implements ActionCommand<void> {
  execute(ctx: ActionContext) {
    ctx.alignment.reset();
    return { ok: true };
  }
}

class AlignmentEventDefaultCommand implements ActionCommand<void> {
  execute(ctx: ActionContext) {
    ctx.alignment.setEvent("default");
    return { ok: true };
  }
}

class AlignmentEventLineCommand implements ActionCommand<void> {
  execute(ctx: ActionContext) {
    ctx.alignment.setEvent("line");
    return { ok: true };
  }
}

export const registerCursorMode = (registry: ActionRegistry) => {
  registry.register(
    {
      id: ActionId.applyQuickShape,
      descKey: "actions.shape.applyQuick",
      shortcuts: [{ key: "Enter", shift: true }],
      category: "cursor",
    },
    () => new ApplyQuickShapeCommand()
  );

  registry.register(
    {
      id: ActionId.createMarcherShape,
      descKey: "actions.shape.create",
      shortcuts: [{ key: "Enter" }],
      category: "cursor",
    },
    () => new CreateMarcherShapeCommand()
  );

  registry.register(
    {
      id: ActionId.deleteMarcherShape,
      descKey: "actions.shape.delete",
      shortcuts: [{ key: "Delete" }],
      category: "cursor",
    },
    () => new DeleteMarcherShapeCommand()
  );

  registry.register(
    {
      id: ActionId.cancelAlignmentUpdates,
      descKey: "actions.alignment.cancelUpdates",
      shortcuts: [{ key: "Escape" }],
      category: "cursor",
    },
    () => new CancelAlignmentUpdatesCommand()
  );

  registry.register(
    {
      id: ActionId.alignmentEventDefault,
      descKey: "actions.cursor.defaultMode",
      shortcuts: [{ key: "v" }],
      category: "cursor",
    },
    () => new AlignmentEventDefaultCommand()
  );

  registry.register(
    {
      id: ActionId.alignmentEventLine,
      descKey: "actions.cursor.lineMode",
      shortcuts: [{ key: "l" }],
      category: "cursor",
    },
    () => new AlignmentEventLineCommand()
  );
};
