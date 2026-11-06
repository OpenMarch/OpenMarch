/* eslint-disable no-console -- a command-line script: it reports what it wrote */
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

const files: Record<string, unknown> = {
    "shortcuts.json": { expert: dialog(false), basic: dialog(true) },
    "actions.json": actions,
    "terms.json": terms,
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
