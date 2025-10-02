import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../../types";
import { ActionRegistry } from "../../registry";

class TogglePreviousPathsCommand implements ActionCommand<void> {
  isToggled(ctx: ActionContext) {
    return ctx.ui.settings.previousPaths ?? false;
  }
  execute(ctx: ActionContext) {
    const prev = ctx.ui.settings.previousPaths ?? false;
    ctx.ui.setSettings({ ...ctx.ui.settings, previousPaths: !prev });
    return { ok: true };
  }
}

class ToggleNextPathsCommand implements ActionCommand<void> {
  isToggled(ctx: ActionContext) {
    return ctx.ui.settings.nextPaths ?? false;
  }
  execute(ctx: ActionContext) {
    const prev = ctx.ui.settings.nextPaths ?? false;
    ctx.ui.setSettings({ ...ctx.ui.settings, nextPaths: !prev });
    return { ok: true };
  }
}

class FocusCanvasCommand implements ActionCommand<void> {
  execute(ctx: ActionContext) {
    ctx.ui.focusCanvas?.();
    return { ok: true };
  }
}

class FocusTimelineCommand implements ActionCommand<void> {
  execute(ctx: ActionContext) {
    ctx.ui.focusTimeline?.();
    return { ok: true };
  }
}

export const registerUIToggles = (registry: ActionRegistry) => {
  registry.register(
    {
      id: ActionId.togglePreviousPagePaths,
      descKey: "actions.ui.togglePreviousPaths",
      toggleOnKey: "actions.ui.showPreviousPaths",
      toggleOffKey: "actions.ui.hidePreviousPaths",
      shortcuts: [{ key: "n" }],
      category: "ui",
    },
    () => new TogglePreviousPathsCommand()
  );

  registry.register(
    {
      id: ActionId.toggleNextPagePaths,
      descKey: "actions.ui.toggleNextPaths",
      toggleOnKey: "actions.ui.showNextPaths",
      toggleOffKey: "actions.ui.hideNextPaths",
      shortcuts: [{ key: "m" }],
      category: "ui",
    },
    () => new ToggleNextPathsCommand()
  );

  registry.register(
    {
      id: ActionId.focusCanvas,
      descKey: "actions.ui.focusCanvas",
      shortcuts: [{ key: "c", alt: true }],
      category: "ui",
    },
    () => new FocusCanvasCommand()
  );

  registry.register(
    {
      id: ActionId.focusTimeline,
      descKey: "actions.ui.focusTimeline",
      shortcuts: [{ key: "t", alt: true }],
      category: "ui",
    },
    () => new FocusTimelineCommand()
  );
};
