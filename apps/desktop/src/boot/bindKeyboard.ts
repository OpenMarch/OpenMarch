import { ActionBus } from "../actions/bus";
import { createKeymapService } from "../actions/keymap/keymap.service";
import { defaultKeymap, holdableActions } from "../actions/keymap/defaultKeymap";
import { createRepeatController } from "../actions/middleware/repeat";
import { ActionId } from "../actions/types";

// Special mapping for WASD and Arrow keys to movement actions
const movementKeyMap: Record<string, ActionId> = {
  "w": ActionId.moveSelectedMarchersUp,
  "W": ActionId.moveSelectedMarchersUp,
  "ArrowUp": ActionId.moveSelectedMarchersUp,
  "s": ActionId.moveSelectedMarchersDown,
  "S": ActionId.moveSelectedMarchersDown,
  "ArrowDown": ActionId.moveSelectedMarchersDown,
  "a": ActionId.moveSelectedMarchersLeft,
  "A": ActionId.moveSelectedMarchersLeft,
  "ArrowLeft": ActionId.moveSelectedMarchersLeft,
  "d": ActionId.moveSelectedMarchersRight,
  "D": ActionId.moveSelectedMarchersRight,
  "ArrowRight": ActionId.moveSelectedMarchersRight,
};

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

    // Check for movement keys first (WASD/Arrows)
    const movementAction = movementKeyMap[e.key];
    if (movementAction && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const marker = `${movementAction}`;
      if (!downKeys.has(marker)) {
        downKeys.add(marker);
        void bus.dispatch(movementAction, undefined);
        repeat.start(movementAction);
      }
      return;
    }

    // Check for regular actions via keymap
    const id = keymap.resolve(e);
    if (!id) return;

    e.preventDefault();
    if (holdableActions.has(id)) {
      const marker = `${id}`;
      if (!downKeys.has(marker)) {
        downKeys.add(marker);
        void bus.dispatch(id, undefined);
        repeat.start(id);
      }
    } else {
      void bus.dispatch(id, undefined);
    }
  };

  const onKeyUp = (e: KeyboardEvent) {
    // Check for movement keys
    const movementAction = movementKeyMap[e.key];
    if (movementAction) {
      const marker = `${movementAction}`;
      if (downKeys.has(marker)) {
        downKeys.delete(marker);
        repeat.stop(movementAction);
      }
      return;
    }

    // Check for regular actions
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
