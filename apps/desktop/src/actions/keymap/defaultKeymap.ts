import { ActionId } from "../types";
import type { Keymap } from "./keymap.service";

// platform-neutral starter; branch by process.platform if needed
export const defaultKeymap: Keymap = {
  "C-z": ActionId.performUndo,
  "y": ActionId.lockX,
  // add others gradually:
  // "ArrowLeft": ActionId.moveLeft,
  // "ArrowRight": ActionId.moveRight,
};

export const holdableActions = new Set<ActionId>([
  // e.g., ActionId.moveLeft, ActionId.moveRight, ...
]);
