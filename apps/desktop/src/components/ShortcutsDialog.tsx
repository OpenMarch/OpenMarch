import { useTolgee } from "@tolgee/react";
import { Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import { Keycaps } from "@/components/timeline/ShortcutTooltip";
import { useShortcutsDialogStore } from "@/stores/ShortcutsDialogStore";

/** The order and names of the groups, by the category in each action's `actions.{category}.*` key */
const GROUPS: readonly (readonly [category: string, title: string])[] = [
    ["playback", "Playback"],
    ["navigation", "Pages"],
    ["timeline", "Timeline"],
    ["edit", "Edit"],
    ["select", "Selection"],
    ["movement", "Move marchers"],
    ["swap", "Move marchers"],
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
 * Keys outside the registered actions: the timeline's own listeners and gestures (UI-12, UI-14),
 * and the nudge, whose registered actions carry no shortcut of their own
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

/** Named keys as people write them: "ESCAPE" is "Esc", "ENTER" is "Enter" */
const readableKeys = (keys: string) =>
    keys
        .split(" + ")
        .map((key) =>
            key === "ESCAPE"
                ? "Esc"
                : key.length > 1 && key === key.toUpperCase()
                  ? key[0] + key.slice(1).toLowerCase()
                  : key,
        )
        .join(" + ");

/** Every shortcut, grouped (`RegisteredActionsObjects` plus `EXTRA_ROWS`) */
export function shortcutGroups(
    translate: (key: string) => string,
): readonly { readonly title: string; readonly rows: readonly Row[] }[] {
    const byCategory = new Map<string, Row[]>();
    for (const action of Object.values(RegisteredActionsObjects)) {
        const shortcut = action.keyboardShortcut;
        if (!shortcut || shortcut.key === "") continue;
        const category = action.descKey.split(".")[1] ?? "";
        const rows = byCategory.get(category) ?? [];
        rows.push({
            label: translate(action.descKey),
            keys: readableKeys(shortcut.toString()),
        });
        byCategory.set(category, rows);
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
 * The keyboard shortcuts list (UI-17 follow-up), as GitHub's and Figma's `?`: every registered
 * shortcut by group, read from the action registry so it stays right, plus the timeline's own keys.
 */
export default function ShortcutsDialog() {
    const open = useShortcutsDialogStore((s) => s.open);
    const setOpen = useShortcutsDialogStore((s) => s.setOpen);
    const { t } = useTolgee(["language"]);
    if (!open) return null;
    const groups = shortcutGroups((key) => t(key));
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
