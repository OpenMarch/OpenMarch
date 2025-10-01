import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../types";
import { ActionRegistry } from "../registry";

class PlayPauseCommand implements ActionCommand<void> {
  isToggled(ctx: ActionContext) {
    return ctx.playback.isPlaying;
  }
  canExecute(ctx: ActionContext) {
    // Can only play if there's a next page
    return ctx.page.getNext(ctx.page.selected) !== null;
  }
  execute(ctx: ActionContext) {
    ctx.playback.setIsPlaying(!ctx.playback.isPlaying);
    return { ok: true };
  }
}

class ToggleMetronomeCommand implements ActionCommand<void> {
  execute(ctx: ActionContext) {
    ctx.playback.toggleMetronome();
    return { ok: true };
  }
}

export const registerPlayback = (registry: ActionRegistry) => {
  registry.register(
    {
      id: ActionId.playPause,
      descKey: "actions.playback.playPause",
      toggleOnKey: "actions.playback.play",
      toggleOffKey: "actions.playback.pause",
      shortcuts: [{ key: " " }], // spacebar
      category: "nav",
    },
    () => new PlayPauseCommand()
  );

  registry.register(
    {
      id: ActionId.toggleMetronome,
      descKey: "actions.playback.toggleMetronome",
      shortcuts: [{ key: "m", ctrl: true }],
      category: "nav",
    },
    () => new ToggleMetronomeCommand()
  );
};
