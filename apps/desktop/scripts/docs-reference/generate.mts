/* eslint-disable no-console -- a command-line script: it reports what it wrote */
// cspell:words commandorcontrol cmdorctrl
// Writes the user guide's reference data from the app's own registries, so the Shortcuts,
// Menus and Settings pages and the guide's key names can't drift from the app.
//
//   pnpm --dir apps/desktop docs:reference          (write)
//   pnpm --dir apps/desktop docs:reference --check  (fail if the committed data is stale)
//
// Output: apps/website/src/data/generated/*.json. See apps/website/AGENTS.md.
import "./node-globals.mts";
import fs from "node:fs";
import path from "node:path";
import tolgee from "@/global/singletons/Tolgee";
import { shortcutGroups } from "@/components/ShortcutsDialog";
import { formatShortcutParts } from "@/shortcuts/bindings";
import { ACTION_IDS, getActionDefinition } from "@/shortcuts/definitions";
import { getActionLabel, type Translate } from "@/shortcuts/labels";
import { holdTerms } from "@/timeline/holdTerms";
import { ALL_SETTINGS_SECTIONS } from "@/settings/sections";
import {
    HELP_MENU_ACTIONS,
    PLAYBACK_MENU_ACTIONS,
    type MenuAction,
} from "@/global/menuActions";
import { applicationMenuTemplate } from "@om-electron/main/application-menu";
import { t as mainT } from "@om-electron/main/i18n";
import type { MenuItemConstructorOptions } from "electron";

const DESKTOP = path.resolve(import.meta.dirname, "../..");
const OUT = path.resolve(DESKTOP, "../website/src/data/generated");
const check = process.argv.includes("--check");

await tolgee.run();
const t: Translate = (key, params) => tolgee.t(key, params as never);

/** A shortcut as each system writes it: keys plus an optional gesture word. */
function both(binding: string) {
    const part = (isMac: boolean) => {
        const { keys, gesture } = formatShortcutParts(binding, isMac);
        return {
            keys,
            ...(gesture ? { gesture: t(`shortcut.gesture.${gesture}`) } : {}),
        };
    };
    return { mac: part(true), other: part(false) };
}

/** A row's shortcut may hold alternatives ("W / A / S / D"). */
function rowShortcuts(keys: string) {
    return keys
        .split(" / ")
        .map((k) =>
            k === "?"
                ? { mac: { keys: ["?"] }, other: { keys: ["?"] } }
                : both(k),
        );
}

// What the Shortcuts dialog lists (Help › Keyboard shortcuts), in Expert and in Basic
function dialog(basic: boolean) {
    const groups = (isMac: boolean) => shortcutGroups(t, {}, isMac, basic);
    const mac = groups(true);
    return groups(false).map((group, g) => ({
        title: group.title,
        rows: group.rows.map((row, r) => ({
            label: row.label,
            other: rowShortcuts(row.keys).map((s) => s.other),
            mac: rowShortcuts(mac[g].rows[r].keys).map((s) => s.mac),
        })),
    }));
}

// Every action by id, for <Kbd action="..."> in the guide's pages
const actions = Object.fromEntries(
    ACTION_IDS.map((id) => {
        const def = getActionDefinition(id);
        return [
            id,
            {
                label: getActionLabel(id, t),
                category: def.category,
                ...(def.expertOnly ? { expertOnly: true } : {}),
                bindings: def.defaultBindings.map(both),
            },
        ];
    }),
);

// The words for a marcher's state on a page, and every other glossary term the guide uses
const terms = { ...holdTerms() };

// The application menu, as macOS and as Windows and Linux build it (electron/main/application-menu.ts)

/** The shortcuts Electron gives role items it isn't handed one for, by system (Electron's menu-item-roles) */
const ROLE_ACCELERATORS: Record<string, { mac?: string; other?: string }> = {
    undo: { mac: "CommandOrControl+Z", other: "CommandOrControl+Z" },
    redo: { mac: "Shift+CommandOrControl+Z", other: "Control+Y" },
    cut: { mac: "CommandOrControl+X", other: "CommandOrControl+X" },
    copy: { mac: "CommandOrControl+C", other: "CommandOrControl+C" },
    paste: { mac: "CommandOrControl+V", other: "CommandOrControl+V" },
    pasteAndMatchStyle: {
        mac: "Shift+Command+Alt+V",
        other: "Shift+CommandOrControl+V",
    },
    selectAll: { mac: "CommandOrControl+A", other: "CommandOrControl+A" },
    reload: { mac: "CommandOrControl+R", other: "CommandOrControl+R" },
    forceReload: {
        mac: "Shift+CommandOrControl+R",
        other: "Shift+CommandOrControl+R",
    },
    toggleDevTools: { mac: "Alt+Command+I", other: "Control+Shift+I" },
    resetZoom: { mac: "CommandOrControl+0", other: "CommandOrControl+0" },
    zoomIn: { mac: "CommandOrControl+Plus", other: "CommandOrControl+Plus" },
    zoomOut: { mac: "CommandOrControl+-", other: "CommandOrControl+-" },
    togglefullscreen: { mac: "Control+Command+F", other: "F11" },
    minimize: { mac: "CommandOrControl+M", other: "CommandOrControl+M" },
    close: { mac: "CommandOrControl+W", other: "CommandOrControl+W" },
    quit: { mac: "CommandOrControl+Q" },
    hide: { mac: "Command+H" },
    hideOthers: { mac: "Command+Alt+H" },
};

/** An Electron accelerator ("CommandOrControl+Shift+Z") as the keys the guide shows. */
function acceleratorKeys(accelerator: string, isMac: boolean) {
    // The app's menu writes Shift+/ as "?", as the Shortcuts dialog does
    if (accelerator === "Shift+/") return ["?"];
    const binding = accelerator
        .split("+")
        .map((part) => {
            const p = part.toLowerCase();
            if (p === "commandorcontrol" || p === "cmdorctrl") return "$mod";
            if (p === "plus") return "PLUS";
            return part;
        })
        .join("+");
    return formatShortcutParts(binding, isMac).keys.map((k) =>
        k === "PLUS" ? "+" : k,
    );
}

type MenuEntry =
    | { separator: true }
    | {
          label: string;
          keys?: string[];
          action?: string;
          expertOnly?: true;
          items?: MenuEntry[];
      };

function menus(isMac: boolean) {
    const menuActions = [...PLAYBACK_MENU_ACTIONS, ...HELP_MENU_ACTIONS];
    // On macOS a renderer action's shortcut is written into its label: find the action back
    const byLabel = new Map<string, MenuAction>(
        menuActions.flatMap((a) => [
            [mainT(a.labelKey), a],
            [
                mainT("menu.withShortcut", {
                    label: mainT(a.labelKey),
                    shortcut: a.accelerator.replace("Shift+/", "?"),
                }),
                a,
            ],
        ]),
    );
    const entries = (items: MenuItemConstructorOptions[]): MenuEntry[] => {
        const out: MenuEntry[] = [];
        for (const item of items) {
            if (item.type === "separator") {
                // Electron hides leading, trailing and doubled separators
                if (out.length && !("separator" in out[out.length - 1]))
                    out.push({ separator: true });
                continue;
            }
            const action = byLabel.get(item.label ?? "");
            const accelerator =
                action?.accelerator ??
                (item.accelerator as string | undefined) ??
                (item.role
                    ? ROLE_ACCELERATORS[item.role]?.[isMac ? "mac" : "other"]
                    : undefined);
            const submenu = Array.isArray(item.submenu)
                ? entries(item.submenu)
                : undefined;
            out.push({
                label: action ? mainT(action.labelKey) : (item.label ?? ""),
                ...(accelerator
                    ? { keys: acceleratorKeys(accelerator, isMac) }
                    : {}),
                ...(action ? { action: action.action } : {}),
                ...(action?.expertOnly ? { expertOnly: true as const } : {}),
                ...(submenu ? { items: submenu } : {}),
            });
        }
        if (out.length && "separator" in out[out.length - 1]) out.pop();
        return out;
    };
    return entries(applicationMenuTemplate({ basic: false, isMacOS: isMac }));
}

// Every setting in the Settings window, by section, for the check that the guide describes each
// one. A search key under another key of its section ("…appearance.light") is one of its options.
const settings = ALL_SETTINGS_SECTIONS.map((section) => {
    const keys = section.searchKeys;
    const isOption = (key: string) =>
        keys.some((other) => key.startsWith(`${other}.`));
    return {
        id: section.id,
        label: t(section.labelKey),
        description: t(section.descriptionKey),
        settings: keys
            .filter((key) => !isOption(key))
            .map((key) => {
                const options = keys.filter((o) => o.startsWith(`${key}.`));
                return {
                    key,
                    label: t(key),
                    ...(options.length
                        ? {
                              options: options.map((o) => ({
                                  key: o,
                                  label: t(o),
                              })),
                          }
                        : {}),
                };
            }),
    };
});

const files: Record<string, unknown> = {
    "shortcuts.json": { expert: dialog(false), basic: dialog(true) },
    "actions.json": actions,
    "terms.json": terms,
    "menus.json": { mac: menus(true), other: menus(false) },
    "settings.json": settings,
};

let stale = 0;
fs.mkdirSync(OUT, { recursive: true });
for (const [name, data] of Object.entries(files)) {
    const file = path.join(OUT, name);
    const text = `${JSON.stringify(data, null, 4)}\n`;
    const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (old === text) continue;
    if (check) {
        stale++;
        console.error(
            `${name} is out of date: run pnpm --dir apps/desktop docs:reference`,
        );
    } else {
        fs.writeFileSync(file, text);
        console.log(`wrote ${path.relative(process.cwd(), file)}`);
    }
}
process.exit(stale ? 1 : 0);
