import { useTolgee } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { Fragment } from "react";
import Shortcut from "@/components/ui/Shortcut";
import { useShortcutsDialogStore } from "@/stores/ShortcutsDialogStore";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { platformBinding } from "@/shortcuts/bindings";
import {
    ACTION_IDS,
    NUDGE_ACTION_IDS,
    getActionDefinition,
    type ActionId,
} from "@/shortcuts/definitions";
import { getDisplayBindings, type ShortcutOverrides } from "@/shortcuts/keymap";
import { getActionLabel, type Translate } from "@/shortcuts/labels";
import { isMacPlatform } from "@/shortcuts/platform";
import { isBasicMode, useIsBasicMode } from "@/stores/EditorModeStore";

/**
 * The order and names of the groups, by each action's category (`shortcuts/definitions.ts`). The
 * title is an i18n key with its English default, resolved when the list is built.
 */
const GROUPS: readonly (readonly [
    category: string,
    titleKey: string,
    title: string,
])[] = [
    ["playback", "shortcutsDialog.group.playback", "Playback"],
    ["navigation", "shortcutsDialog.group.navigation", "Pages"],
    ["timeline", "shortcutsDialog.group.timeline", "Timeline"],
    ["edit", "shortcutsDialog.group.edit", "Edit"],
    ["select", "shortcutsDialog.group.select", "Selection"],
    ["movement", "shortcutsDialog.group.movement", "Move marchers"],
    ["alignment", "shortcutsDialog.group.alignment", "Alignment"],
    ["shape", "shortcutsDialog.group.shape", "Shapes"],
    ["batchEdit", "shortcutsDialog.group.batchEdit", "Batch editing"],
    ["cursor", "shortcutsDialog.group.cursor", "Tools"],
    ["ui", "shortcutsDialog.group.ui", "View"],
    ["file", "shortcutsDialog.group.file", "File"],
];

interface Row {
    readonly label: string;
    /**
     * Its shortcut as a binding ("Shift+Space", "Mod + Drag", "?"), or alternatives joined by
     * " / " ("W / A / S / D"); shown as `Shortcut`s for this platform
     */
    readonly keys: string;
}

interface ExtraRow extends Row {
    /** i18n key for `label`, which is its English default */
    readonly labelKey: string;
}

/**
 * Keys outside the shortcut actions: the timeline's own listeners and gestures (UI-12, UI-14),
 * and the nudge, whose many actions (one per direction and step) show as one row
 */
const EXTRA_ROWS: Readonly<Record<string, readonly ExtraRow[]>> = {
    timeline: [
        {
            label: "Fit the show, or back",
            labelKey: "shortcutsDialog.timeline.fitShow",
            keys: "Shift + Z",
        },
        {
            label: "Leave an isolated move",
            labelKey: "shortcutsDialog.timeline.leaveIsolatedMove",
            keys: "Escape",
        },
        {
            label: "Draw a range (drag)",
            labelKey: "shortcutsDialog.timeline.drawRange",
            keys: "Mod + Drag",
        },
        {
            label: "Zoom the timeline",
            labelKey: "shortcutsDialog.timeline.zoom",
            keys: "Mod + Scroll",
        },
        {
            label: "Drag without snapping",
            labelKey: "shortcutsDialog.timeline.dragWithoutSnapping",
            keys: "Alt + Drag",
        },
    ],
    movement: [
        {
            label: "Nudge the selected marchers",
            labelKey: "shortcutsDialog.movement.nudge",
            keys: "W / A / S / D",
        },
        {
            label: "Fine control while dragging marchers",
            labelKey: "shortcutsDialog.movement.fineControl",
            keys: "Shift + Drag",
        },
        {
            label: "Move on one axis while dragging",
            labelKey: "shortcutsDialog.movement.constrain",
            keys: "Mod + Drag",
        },
    ],
    // While drawing, stretching, moving or dragging a spacing of a shape (modifier roles, version
    // A); "Mod" is Cmd on a Mac, Ctrl elsewhere. Snapping off is the Snap toggle (Shift+M).
    shape: [
        {
            label: "Fine control, still catching yard lines and hashes",
            labelKey: "shortcutsDialog.shape.fineControl",
            keys: "Shift + Drag",
        },
        {
            label: "Constrain (equal spacings, one axis, flips proportional scaling)",
            labelKey: "shortcutsDialog.shape.constrain",
            keys: "Mod + Drag",
        },
        {
            label: "Draw or resize a box from center",
            labelKey: "shortcutsDialog.shape.fromCenter",
            keys: "Alt + Drag",
        },
    ],
};

/** Shown elsewhere: the nudge (`EXTRA_ROWS`) */
const LISTED_ELSEWHERE: ReadonlySet<ActionId> = new Set(NUDGE_ACTION_IDS);

/**
 * An action's binding for its row. "?" is Shift plus a key that varies by layout, so it is
 * written alone.
 */
const shortcutKeys = (binding: string, isMac: boolean) =>
    platformBinding(binding, isMac) === platformBinding("Shift+Slash", isMac)
        ? "?"
        : binding;

/**
 * Every shortcut, grouped (the actions in `shortcuts/definitions.ts`, as rebound, plus
 * `EXTRA_ROWS`), without the Expert-only ones in Basic mode
 */
export function shortcutGroups(
    translate: Translate,
    overrides: ShortcutOverrides = {},
    isMac: boolean = isMacPlatform(),
    basic: boolean = isBasicMode(),
): readonly { readonly title: string; readonly rows: readonly Row[] }[] {
    const byCategory = new Map<string, Row[]>();
    for (const id of ACTION_IDS) {
        const action = getActionDefinition(id);
        if (LISTED_ELSEWHERE.has(id)) continue;
        if (basic && action.expertOnly) continue;
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
    for (const [category, titleKey, englishTitle] of GROUPS) {
        const rows = [
            ...(byCategory.get(category) ?? []),
            ...(EXTRA_ROWS[category] ?? []).map((row) => ({
                label: tolgee.t(row.labelKey, row.label),
                keys: row.keys,
            })),
        ];
        byCategory.delete(category);
        if (rows.length === 0) continue;
        const title = tolgee.t(titleKey, englishTitle);
        const same = groups.find((g) => g.title === title);
        if (same) same.rows.push(...rows);
        else groups.push({ title, rows });
    }
    // A category added later still shows, at the end
    const otherTitle = tolgee.t("shortcutsDialog.group.other", "Other");
    for (const rows of byCategory.values()) {
        const other = groups.find((g) => g.title === otherTitle);
        if (other) other.rows.push(...rows);
        else groups.push({ title: otherTitle, rows });
    }
    return groups;
}

/** A row's shortcut, or its alternatives with "/" between */
function RowKeys({ keys }: { keys: string }) {
    return (
        <span className="flex items-center gap-4">
            {keys.split(" / ").map((binding, i) => (
                <Fragment key={binding}>
                    {i > 0 && (
                        <span aria-hidden="true" className="text-text-subtitle">
                            /
                        </span>
                    )}
                    <Shortcut binding={binding} size="md" />
                </Fragment>
            ))}
        </span>
    );
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
    const basic = useIsBasicMode();
    if (!open) return null;
    const groups = shortcutGroups(
        (key, params) => t(key, params as never),
        overrides,
        isMacPlatform(),
        basic,
    );
    return (
        <Dialog open onOpenChange={setOpen}>
            <DialogContent
                className="max-h-[80vh] w-[min(56rem,90vw)] overflow-y-auto"
                aria-describedby={undefined}
            >
                <DialogTitle>{t("shortcutsDialog.title")}</DialogTitle>
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
                                            <RowKeys keys={row.keys} />
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
