import { ActionBus } from "../actions/bus";
import { createKeymapService } from "../actions/keymap/keymap.service";
import { defaultKeymap, holdableActions } from "../actions/keymap/defaultKeymap";
import { createRepeatController } from "../actions/middleware/repeat";

export const bindKeyboard = (bus: ActionBus) => {
  const keymap = createKeymapService(defaultKeymap);
  const repeat = createRepeatController(bus, holdableActions);

  const downKeys = new Set<string>();

  const onKeyDown = (e: KeyboardEvent) => {
    // Avoid typing conflicts in inputs/textareas
    const target = e.target as HTMLElement | null;
    const isEditable =
      target &&
      (target.tagName === "INPUT" ||
       target.tagName === "TEXTAREA" ||
       (target as any).isContentEditable);
    if (isEditable) return;

    const id = keymap.resolve(e);
    if (!id) return;

    e.preventDefault();
    if (holdableActions.has(id)) {
      const marker = `${id}`;
      if (!downKeys.has(marker)) {
        downKeys.add(marker);
        void bus.dispatch(id, undefined); // fire once immediately
        repeat.start(id);
      }
    } else {
      void bus.dispatch(id, undefined);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const id = keymap.resolve(e);
    if (!id) return;
    const marker = `${id}`;
    if (downKeys.has(marker)) {
      downKeys.delete(marker);
      repeat.stop(id);
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
};
