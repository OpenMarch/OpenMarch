import * as React from "react";
import { KeyboardShortcut } from "../../actions/types";
import { toHumanShortcut } from "../../actions/keymap/keymap.service";

export const ShortcutHint = ({ shortcut }: { shortcut?: KeyboardShortcut }) => {
  if (!shortcut) return null;
  return <span>{toHumanShortcut(shortcut)}</span>;
};
