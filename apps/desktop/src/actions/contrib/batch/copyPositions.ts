import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../../types";
import { ActionRegistry } from "../../registry";

class SetAllMarchersToPreviousPageCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return !!ctx.page.selected && !!ctx.queries.previousMarcherPages;
  }
  execute(ctx: ActionContext) {
    const previousPage = ctx.page.getPrevious(ctx.page.selected);
    if (!previousPage || !ctx.queries.previousMarcherPages) {
      ctx.toast.error(ctx.t("actions.batchEdit.noPreviousPage"));
      return { ok: false, error: new Error("No previous page") };
    }

    const changes = Object.values(ctx.queries.previousMarcherPages).map((mp: any) => ({
      marcher_id: mp.marcher_id,
      page_id: ctx.page.selected.id,
      x: mp.x as number,
      y: mp.y as number,
      notes: mp.notes || undefined,
    }));

    ctx.mutations.updateMarcherPages(changes);
    ctx.toast.success(
      ctx.t("actions.batchEdit.setAllToPreviousSuccess", {
        count: Object.keys(ctx.queries.previousMarcherPages).length,
        currentPage: ctx.page.selected.name,
        previousPage: previousPage.name,
      })
    );
    return { ok: true };
  }
}

class SetSelectedMarchersToPreviousPageCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return (
      !!ctx.page.selected &&
      !!ctx.queries.previousMarcherPages &&
      ctx.selection.selectedMarchers.length > 0
    );
  }
  execute(ctx: ActionContext) {
    const previousPage = ctx.page.getPrevious(ctx.page.selected);
    if (!previousPage || !ctx.queries.previousMarcherPages) {
      ctx.toast.error(ctx.t("actions.batchEdit.noPreviousPage"));
      return { ok: false, error: new Error("No previous page") };
    }

    const selectedMarcherIds = ctx.selection.selectedMarchers.map((m) => m.id);
    const filteredPreviousMarcherPages = selectedMarcherIds
      .map((id) => ctx.queries.previousMarcherPages[id])
      .filter(Boolean);

    if (filteredPreviousMarcherPages.length > 0) {
      const changes = filteredPreviousMarcherPages.map((mp: any) => ({
        marcher_id: mp.marcher_id,
        page_id: ctx.page.selected.id,
        x: mp.x as number,
        y: mp.y as number,
        notes: mp.notes || undefined,
      }));

      ctx.mutations.updateMarcherPages(changes);
      ctx.toast.success(
        ctx.t("actions.batchEdit.setSelectedToPreviousSuccess", {
          count: filteredPreviousMarcherPages.length,
          currentPage: ctx.page.selected.name,
          previousPage: previousPage.name,
        })
      );
      return { ok: true };
    }

    return { ok: false, error: new Error("No marchers to update") };
  }
}

class SetAllMarchersToNextPageCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return !!ctx.page.selected && !!ctx.queries.nextMarcherPages;
  }
  execute(ctx: ActionContext) {
    const nextPage = ctx.page.getNext(ctx.page.selected);
    if (!nextPage || !ctx.queries.nextMarcherPages) {
      ctx.toast.error(ctx.t("actions.batchEdit.noNextPage"));
      return { ok: false, error: new Error("No next page") };
    }

    const selectedMarcherIds = ctx.selection.selectedMarchers.map((m) => m.id);
    const nextPageMarcherPages = selectedMarcherIds
      .map((id) => ctx.queries.nextMarcherPages[id])
      .filter(Boolean);

    const changes = nextPageMarcherPages.map((mp: any) => ({
      marcher_id: mp.marcher_id,
      page_id: ctx.page.selected.id,
      x: mp.x as number,
      y: mp.y as number,
      notes: mp.notes || undefined,
    }));

    ctx.mutations.updateMarcherPages(changes);
    ctx.toast.success(
      ctx.t("actions.batchEdit.setAllToNextSuccess", {
        count: nextPageMarcherPages.length,
        currentPage: ctx.page.selected.name,
        nextPage: nextPage.name,
      })
    );
    return { ok: true };
  }
}

class SetSelectedMarchersToNextPageCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return (
      !!ctx.page.selected &&
      !!ctx.queries.nextMarcherPages &&
      ctx.selection.selectedMarchers.length > 0
    );
  }
  execute(ctx: ActionContext) {
    const nextPage = ctx.page.getNext(ctx.page.selected);
    if (!nextPage || !ctx.queries.nextMarcherPages) {
      ctx.toast.error(ctx.t("actions.batchEdit.noNextPage"));
      return { ok: false, error: new Error("No next page") };
    }

    const selectedMarcherIds = ctx.selection.selectedMarchers.map((m) => m.id);
    const nextPageMarcherPages = selectedMarcherIds
      .map((id) => ctx.queries.nextMarcherPages[id])
      .filter(Boolean);

    if (nextPageMarcherPages.length > 0) {
      const changes = nextPageMarcherPages.map((mp: any) => ({
        marcher_id: mp.marcher_id,
        page_id: ctx.page.selected.id,
        x: mp.x as number,
        y: mp.y as number,
        notes: mp.notes || undefined,
      }));

      ctx.mutations.updateMarcherPages(changes);
      ctx.toast.success(
        ctx.t("actions.batchEdit.setSelectedToNextSuccess", {
          count: nextPageMarcherPages.length,
          currentPage: ctx.page.selected.name,
          nextPage: nextPage.name,
        })
      );
      return { ok: true };
    }

    return { ok: false, error: new Error("No marchers to update") };
  }
}

export const registerBatchCopyPositions = (registry: ActionRegistry) => {
  registry.register(
    {
      id: ActionId.setAllMarchersToPreviousPage,
      descKey: "actions.batchEdit.setAllToPrevious",
      shortcuts: [{ key: "p", shift: true, ctrl: true }],
      category: "edit",
    },
    () => new SetAllMarchersToPreviousPageCommand()
  );

  registry.register(
    {
      id: ActionId.setSelectedMarchersToPreviousPage,
      descKey: "actions.batchEdit.setSelectedToPrevious",
      shortcuts: [{ key: "p", shift: true }],
      category: "edit",
    },
    () => new SetSelectedMarchersToPreviousPageCommand()
  );

  registry.register(
    {
      id: ActionId.setAllMarchersToNextPage,
      descKey: "actions.batchEdit.setAllToNext",
      shortcuts: [{ key: "n", shift: true, ctrl: true }],
      category: "edit",
    },
    () => new SetAllMarchersToNextPageCommand()
  );

  registry.register(
    {
      id: ActionId.setSelectedMarchersToNextPage,
      descKey: "actions.batchEdit.setSelectedToNext",
      shortcuts: [{ key: "n", shift: true }],
      category: "edit",
    },
    () => new SetSelectedMarchersToNextPageCommand()
  );
};
