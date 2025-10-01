import { ActionId, KeyboardShortcut } from "../types";

export type KeyChord = { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean };
export type Keymap = Record<string /* normalized chord */, ActionId>;

export interface KeymapService {
  resolve(e: KeyboardEvent): ActionId | null;
  registerOverride(chord: KeyChord, id: ActionId): void;
  listBindings(): Array<{ chord: KeyChord; id: ActionId }>;
  normalizeChord(chord: KeyChord): string;
}

const normalize = (c: KeyChord) =>
  `${c.ctrl ? "C-" : ""}${c.alt ? "A-" : ""}${c.shift ? "S-" : ""}${String(c.key).toLowerCase()}`;

export const toChord = (ks: KeyboardShortcut): KeyChord => ({
  key: ks.key,
  ctrl: !!ks.ctrl,
  alt: !!ks.alt,
  shift: !!ks.shift,
});

export const createKeymapService = (base: Keymap): KeymapService => {
  const map = new Map<string, ActionId>(Object.entries(base));
  return {
    resolve(e) {
      const chord: KeyChord = {
        key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
        ctrl: e.ctrlKey || e.metaKey,
        alt: e.altKey,
        shift: e.shiftKey,
      };
      return map.get(normalize(chord)) ?? null;
    },
    registerOverride(chord, id) {
      map.set(normalize(chord), id);
    },
    listBindings() {
      return [...map.entries()].map(([norm, id]) => {
        // minimal round-trip; if you need full parse, store chords separately
        return { chord: { key: norm.split("-").pop() || "" }, id };
      });
    },
    normalizeChord: normalize,
  };
};

export const toHumanShortcut = (ks: KeyboardShortcut) => {
  const mods: string[] = [];
  if (ks.ctrl) mods.push("Ctrl/Cmd");
  if (ks.alt) mods.push("Alt");
  if (ks.shift) mods.push("Shift");
  return `${mods.length ? mods.join("+") + "+" : ""}${ks.key}`;
};
