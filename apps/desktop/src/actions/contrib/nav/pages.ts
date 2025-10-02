import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../../types";
import { ActionRegistry } from "../../registry";

class NextPageCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return !ctx.playback.isPlaying && ctx.page.getNext(ctx.page.selected) !== null;
  }
  execute(ctx: ActionContext) {
    const nextPage = ctx.page.getNext(ctx.page.selected);
    if (nextPage) {
      ctx.page.setSelected(nextPage);
      return { ok: true };
    }
    return { ok: false, error: new Error("No next page available") };
  }
}

class PreviousPageCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return !ctx.playback.isPlaying && ctx.page.getPrevious(ctx.page.selected) !== null;
  }
  execute(ctx: ActionContext) {
    const previousPage = ctx.page.getPrevious(ctx.page.selected);
    if (previousPage) {
      ctx.page.setSelected(previousPage);
      return { ok: true };
    }
    return { ok: false, error: new Error("No previous page available") };
  }
}

class FirstPageCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return !ctx.playback.isPlaying && ctx.page.all.length > 0;
  }
  execute(ctx: ActionContext) {
    const firstPage = ctx.page.all[0];
    if (firstPage) {
      ctx.page.setSelected(firstPage);
      return { ok: true };
    }
    return { ok: false, error: new Error("No pages available") };
  }
}

class LastPageCommand implements ActionCommand<void> {
  canExecute(ctx: ActionContext) {
    return !ctx.playback.isPlaying && ctx.page.all.length > 0;
  }
  execute(ctx: ActionContext) {
    const lastPage = ctx.page.all[ctx.page.all.length - 1];
    if (lastPage) {
      ctx.page.setSelected(lastPage);
      return { ok: true };
    }
    return { ok: false, error: new Error("No pages available") };
  }
}

export const registerNavPages = (registry: ActionRegistry) => {
  registry.register(
    {
      id: ActionId.nextPage,
      descKey: "actions.navigation.nextPage",
      shortcuts: [{ key: "e" }],
      category: "nav",
    },
    () => new NextPageCommand()
  );

  registry.register(
    {
      id: ActionId.previousPage,
      descKey: "actions.navigation.previousPage",
      shortcuts: [{ key: "q" }],
      category: "nav",
    },
    () => new PreviousPageCommand()
  );

  registry.register(
    {
      id: ActionId.firstPage,
      descKey: "actions.navigation.firstPage",
      shortcuts: [{ key: "q", shift: true }],
      category: "nav",
    },
    () => new FirstPageCommand()
  );

  registry.register(
    {
      id: ActionId.lastPage,
      descKey: "actions.navigation.lastPage",
      shortcuts: [{ key: "e", shift: true }],
      category: "nav",
    },
    () => new LastPageCommand()
  );
};
