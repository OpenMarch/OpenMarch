import { useTolgee } from "@tolgee/react";
import { Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { Keycaps } from "@/components/timeline/ShortcutTooltip";
import { useShortcutsDialogStore } from "@/stores/ShortcutsDialogStore";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { formatBindingKeys, platformBinding } from "@/shortcuts/bindings";
import {
    ACTION_IDS,
    NUDGE_ACTION_IDS,
    TAP_BEATS_ACTION_IDS,
    getActionDefinition,
    type ActionId,
} from "@/shortcuts/definitions";
import { getDisplayBindings, type ShortcutOverrides } from "@/shortcuts/keymap";
import { getActionLabel, type Translate } from "@/shortcuts/labels";
import { isMacPlatform } from "@/shortcuts/platform";

/** The order and names of the groups, by each action's category (`shortcuts/definitions.ts`) */
const GROUPS: readonly (readonly [category: string, title: string])[] = [
    ["playback", "Playback"],
    ["navigation", "Pages"],
    ["timeline", "Timeline"],
    ["edit", "Edit"],
    ["select", "Selection"],
    ["movement", "Move marchers"],
    ["alignment", "Alignment"],
    ["shape", "Shapes"],
    ["batchEdit", "Batch editing"],
    ["cursor", "Tools"],
    ["ui", "View"],
    ["file", "File"],
];

interface Row {
    readonly label: string;
    readonly keys: string;
}

/**
 * Keys outside the shortcut actions: the timeline's own listeners and gestures (UI-12, UI-14),
 * and the nudge, whose many actions (one per direction and step) show as one row
 */
const EXTRA_ROWS: Readonly<Record<string, readonly Row[]>> = {
    timeline: [
        { label: "Go to a page, measure or rehearsal mark", keys: "G" },
        { label: "Fit the show, or back", keys: "Shift + Z" },
        { label: "Leave an isolated move", keys: "Esc" },
        { label: "Draw a range (drag)", keys: "Ctrl + Drag" },
        { label: "Zoom the timeline", keys: "Ctrl + Scroll" },
        { label: "Drag without snapping", keys: "Alt + Drag" },
    ],
    movement: [{ label: "Nudge the selected marchers", keys: "W A S D" }],
};

/** Shown elsewhere: the nudge (`EXTRA_ROWS`), the tap-beat digits and the beat editor's keys */
const LISTED_ELSEWHERE: ReadonlySet<ActionId> = new Set([
    ...NUDGE_ACTION_IDS,
    ...TAP_BEATS_ACTION_IDS,
]);

/**
 * An action's shortcut as keycaps joined with " + ". "?" is Shift plus a key that varies by
 * layout, so it is written alone.
 */
const shortcutKeys = (binding: string, isMac: boolean) =>
    platformBinding(binding, isMac) === platformBinding("Shift+Slash", isMac)
        ? "?"
        : formatBindingKeys(binding, isMac).join(" + ");

/** Every shortcut, grouped (the actions in `shortcuts/definitions.ts`, as rebound, plus `EXTRA_ROWS`) */
export function shortcutGroups(
    translate: Translate,
    overrides: ShortcutOverrides = {},
    isMac: boolean = isMacPlatform(),
): readonly { readonly title: string; readonly rows: readonly Row[] }[] {
    const byCategory = new Map<string, Row[]>();
    for (const id of ACTION_IDS) {
        const action = getActionDefinition(id);
        if (LISTED_ELSEWHERE.has(id) || action.scope === "timeline") continue;
        const [binding] = getDisplayBindings(id, overrides, isMac);
        if (!binding) continue;
        const rows = byCategory.get(action.category) ?? [];
        rows.push({
            label: getActionLabel(id, translate),
            keys: shortcutKeys(binding, isMac),
        });
        byCategory.set(action.category, rows);
    }
    const groups: { title: string; rows: Row[] }[] = [];
    for (const [category, title] of GROUPS) {
        const rows = [
            ...(byCategory.get(category) ?? []),
            ...(EXTRA_ROWS[category] ?? []),
        ];
        byCategory.delete(category);
        if (rows.length === 0) continue;
        const same = groups.find((g) => g.title === title);
        if (same) same.rows.push(...rows);
        else groups.push({ title, rows });
    }
    // A category added later still shows, at the end
    for (const rows of byCategory.values()) {
        const other = groups.find((g) => g.title === "Other");
        if (other) other.rows.push(...rows);
        else groups.push({ title: "Other", rows });
    }
    return groups;
}

/**
 * The keyboard shortcuts list (UI-17 follow-up), as GitHub's and Figma's `?`: every shortcut by
 * group, read from the action definitions and the user's changed shortcuts so it stays right,
 * plus the timeline's own keys. Settings has the full list, where shortcuts can be changed.
 */
export default function ShortcutsDialog() {
    const open = useShortcutsDialogStore((s) => s.open);
    const setOpen = useShortcutsDialogStore((s) => s.setOpen);
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const { t } = useTolgee(["language"]);
    if (!open) return null;
    const groups = shortcutGroups(
        (key, params) => t(key, params as never),
        overrides,
    );
    return (
        <Dialog open onOpenChange={setOpen}>
            <DialogContent
                className="max-h-[80vh] w-[min(56rem,90vw)] overflow-y-auto"
                aria-describedby={undefined}
            >
                <DialogTitle>Keyboard shortcuts</DialogTitle>
                <div
                    data-testid="shortcuts-dialog"
                    className="columns-1 gap-24 md:columns-2"
                >
                    {groups.map((group) => (
                        <section
                            key={group.title}
                            className="mb-16 break-inside-avoid"
                        >
                            <h3 className="text-text-subtitle mb-6 text-[12px] font-medium tracking-wide uppercase">
                                {group.title}
                            </h3>
                            <dl className="flex flex-col gap-4">
                                {group.rows.map((row) => (
                                    <div
                                        key={`${row.label}|${row.keys}`}
                                        className="flex items-center justify-between gap-12 text-[13px]"
                                    >
                                        <dt className="text-text">
                                            {row.label}
                                        </dt>
                                        <dd className="shrink-0">
                                            <Keycaps shortcut={row.keys} />
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
