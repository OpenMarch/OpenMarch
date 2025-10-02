import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../../types";
import { ActionRegistry } from "../../registry";

class SnapToNearestWholeCommand implements ActionCommand<void> {
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
      x: Math.round(mp.x as number),
      y: Math.round(mp.y as number),
      notes: mp.notes,
    }));

    ctx.mutations.updateMarcherPages(changes);
    return { ok: true };
  }
}

class AlignVerticallyCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.selection.selectedMarchers.length > 1;
  }
  execute(ctx: ActionContext) {
    const selectedMarcherPages = ctx.selection.getSelectedMarcherPages();
    if (selectedMarcherPages.length < 2) {
      return { ok: false, error: new Error("Need at least 2 marchers") };
    }

    // Align to average X
    const avgX =
      selectedMarcherPages.reduce((sum: number, mp: any) => sum + (mp.x as number), 0) /
      selectedMarcherPages.length;

    const changes = selectedMarcherPages.map((mp: any) => ({
      marcher_id: mp.marcher_id,
      page_id: mp.page_id,
      x: avgX,
      y: mp.y as number,
      notes: mp.notes,
    }));

    ctx.mutations.updateMarcherPages(changes);
    return { ok: true };
  }
}

class AlignHorizontallyCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.selection.selectedMarchers.length > 1;
  }
  execute(ctx: ActionContext) {
    const selectedMarcherPages = ctx.selection.getSelectedMarcherPages();
    if (selectedMarcherPages.length < 2) {
      return { ok: false, error: new Error("Need at least 2 marchers") };
    }

    // Align to average Y
    const avgY =
      selectedMarcherPages.reduce((sum: number, mp: any) => sum + (mp.y as number), 0) /
      selectedMarcherPages.length;

    const changes = selectedMarcherPages.map((mp: any) => ({
      marcher_id: mp.marcher_id,
      page_id: mp.page_id,
      x: mp.x as number,
      y: avgY,
      notes: mp.notes,
    }));

    ctx.mutations.updateMarcherPages(changes);
    return { ok: true };
  }
}

class EvenlyDistributeVerticallyCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.selection.selectedMarchers.length > 2;
  }
  execute(ctx: ActionContext) {
    const selectedMarcherPages = ctx.selection.getSelectedMarcherPages();
    if (selectedMarcherPages.length < 3) {
      return { ok: false, error: new Error("Need at least 3 marchers") };
    }

    // Sort by Y position
    const sorted = [...selectedMarcherPages].sort((a: any, b: any) => (a.y as number) - (b.y as number));
    const minY = sorted[0].y as number;
    const maxY = sorted[sorted.length - 1].y as number;
    const step = (maxY - minY) / (sorted.length - 1);

    const changes = sorted.map((mp: any, i: number) => ({
      marcher_id: mp.marcher_id,
      page_id: mp.page_id,
      x: mp.x as number,
      y: minY + i * step,
      notes: mp.notes,
    }));

    ctx.mutations.updateMarcherPages(changes);
    return { ok: true };
  }
}

class EvenlyDistributeHorizontallyCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.selection.selectedMarchers.length > 2;
  }
  execute(ctx: ActionContext) {
    const selectedMarcherPages = ctx.selection.getSelectedMarcherPages();
    if (selectedMarcherPages.length < 3) {
      return { ok: false, error: new Error("Need at least 3 marchers") };
    }

    // Sort by X position
    const sorted = [...selectedMarcherPages].sort((a: any, b: any) => (a.x as number) - (b.x as number));
    const minX = sorted[0].x as number;
    const maxX = sorted[sorted.length - 1].x as number;
    const step = (maxX - minX) / (sorted.length - 1);

    const changes = sorted.map((mp: any, i: number) => ({
      marcher_id: mp.marcher_id,
      page_id: mp.page_id,
      x: minX + i * step,
      y: mp.y as number,
      notes: mp.notes,
    }));

    ctx.mutations.updateMarcherPages(changes);
    return { ok: true };
  }
}

class SwapMarchersCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return ctx.selection.selectedMarchers.length === 2;
  }
  execute(ctx: ActionContext) {
    const selectedMarcherPages = ctx.selection.getSelectedMarcherPages();
    if (selectedMarcherPages.length !== 2) {
      ctx.toast.error(ctx.t("actions.swap.selectTwoMarchers"));
      return { ok: false, error: new Error("Need exactly 2 marchers") };
    }

    const [mp1, mp2] = selectedMarcherPages;
    ctx.mutations.swapMarchers({
      marcherPage1Id: mp1.id,
      marcherPage2Id: mp2.id,
    });
    return { ok: true };
  }
}

export const registerAlignmentOps = (registry: ActionRegistry) => {
  registry.register(
    {
      id: ActionId.snapToNearestWhole,
      descKey: "actions.alignment.snapToWhole",
      shortcuts: [{ key: "1" }],
      category: "align",
    },
    () => new SnapToNearestWholeCommand()
  );

  registry.register(
    {
      id: ActionId.alignVertically,
      descKey: "actions.alignment.alignVertically",
      shortcuts: [{ key: "v", alt: true }],
      category: "align",
    },
    () => new AlignVerticallyCommand()
  );

  registry.register(
    {
      id: ActionId.alignHorizontally,
      descKey: "actions.alignment.alignHorizontally",
      shortcuts: [{ key: "h", alt: true }],
      category: "align",
    },
    () => new AlignHorizontallyCommand()
  );

  registry.register(
    {
      id: ActionId.evenlyDistributeVertically,
      descKey: "actions.alignment.distributeVertically",
      shortcuts: [{ key: "v", shift: true }],
      category: "align",
    },
    () => new EvenlyDistributeVerticallyCommand()
  );

  registry.register(
    {
      id: ActionId.evenlyDistributeHorizontally,
      descKey: "actions.alignment.distributeHorizontally",
      shortcuts: [{ key: "h", shift: true }],
      category: "align",
    },
    () => new EvenlyDistributeHorizontallyCommand()
  );

  registry.register(
    {
      id: ActionId.swapMarchers,
      descKey: "actions.swap.swap",
      shortcuts: [{ key: "s", ctrl: true }],
      category: "align",
    },
    () => new SwapMarchersCommand()
  );
};

