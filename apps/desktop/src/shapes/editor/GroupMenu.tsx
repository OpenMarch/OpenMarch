import { keepShortcut } from "@/components/timeline/timelineHotkeys";
import clsx from "clsx";
import * as Popover from "@radix-ui/react-popover";
import { CaretDownIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState, type FocusEvent } from "react";
import tolgee from "@/global/singletons/Tolgee";
import type { Roles } from "@/input/modifierRoles";
import type { ToolEnv, ToolGroup } from "../tool/toolKind";
import { groupColor } from "../field/groupDrawing";
import { setGroupMenu } from "../field/shapePointer";
import {
    countLabel,
    GroupButton,
    useGroupEdits,
    type GroupTarget,
} from "./GroupChips";
import {
    groupPlaces,
    groupSummary,
    groupSummaryStyle,
    type GroupSummaryStyle,
} from "./groupSummary";
import { useEditorMenu, useMenuFocus } from "./menuFocus";
import { ScrubNumber } from "./ScrubNumber";
import { Tip } from "@/components/ui/Tip";

/** Marks the group menu's popover, so focus carried in it counts as in the editor's intervals */
export const GROUP_MENU_ATTRIBUTE = "data-shape-group-menu";

/**
 * A kind's mixed intervals once there are two groups or more (owner feedback on #526): one quiet
 * button in the floating editor, "Multiple intervals" (or the groups summed up, `2·3 + 4·2`, with
 * the `numbers` style), opening a menu with a row per group. Each row says where its marchers
 * stand along the shape ("First 2", "Next 3", "Last 3") and gives its count and interval, typed or dragged as the chips were, with × to remove it; Add group
 * sits below, and a field at the top takes a whole list (`2*3+4*2`). Each group has a color: while
 * the menu is open the field rings every group's spots in it, and the group whose row is pointed
 * at, focused or edited lights up with its gaps labeled.
 */
export function GroupMenu({
    target,
    groups,
    envFor,
    onScrubbing,
    summary = groupSummaryStyle(),
}: {
    target: GroupTarget;
    groups: readonly ToolGroup[];
    /** The field's tool environment with `roles` held; null with no field */
    envFor: (roles?: Roles) => ToolEnv | null;
    /** An interval's drag began or ended, for the field to show the lines it lands on */
    onScrubbing?: (on: boolean) => void;
    summary?: GroupSummaryStyle;
}) {
    const [open, setOpen] = useEditorMenu();
    const focus = useMenuFocus((el) =>
        el.querySelector<HTMLElement>("[data-group-list]"),
    );
    // The group lit on the field: the one being dragged, else pointed at, else focused
    const [dragged, setDragged] = useState<number | null>(null);
    const [hovered, setHovered] = useState<number | null>(null);
    const [focused, setFocused] = useState<number | null>(null);
    const lit = dragged ?? hovered ?? focused;
    const edits = useGroupEdits(target, envFor, (on, index, part) => {
        setDragged(on ? index : null);
        if (part === "interval" || !on) onScrubbing?.(on);
    });
    useEffect(() => {
        setGroupMenu(
            open
                ? { lit: lit !== null && lit < groups.length ? lit : null }
                : null,
        );
    }, [open, lit, groups.length]);
    // Gone (back to one group, or the editor closed): the field's colors and the shared menu go too
    useEffect(
        () => () => {
            setGroupMenu(null);
            setOpen(false);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );
    if (!edits) return null;
    const { type, scrub, add, remove } = edits;

    const label =
        summary === "numbers"
            ? groupSummary(groups)
            : tolgee.t("shapes.groups.multiple", "Multiple intervals");
    const places = groupPlaces(groups);
    const leaveRow = (i: number) => (e: FocusEvent) => {
        const next = e.relatedTarget as Node | null;
        if (!next || !e.currentTarget.contains(next))
            setFocused((f) => (f === i ? null : f));
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Tip
                label={tolgee.t(
                    "shapes.groups.menuTip",
                    "Groups of marchers at their own intervals",
                )}
            >
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        // The name starts with what the button says; the numbers say it all
                        aria-label={
                            summary === "numbers"
                                ? undefined
                                : tolgee.t(
                                      "shapes.groups.menuLabel",
                                      "Multiple intervals: {groups}",
                                      {
                                          groups: groupSummary(
                                              groups,
                                              groups.length,
                                          ),
                                      },
                                  )
                        }
                        {...focus.trigger}
                        // Focus lands here after a list is typed, where the interval was: Enter
                        // still places the shape, as it did from the interval. Space and the
                        // arrow down open the menu
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                keepShortcut(e);
                                return;
                            }
                            if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setOpen(true);
                            }
                            focus.trigger.onKeyDown(e);
                        }}
                        data-testid="shape-groups-menu"
                        data-group-menu-trigger
                        data-summary={summary}
                        className="rounded-4 hover:bg-fg-2 flex min-h-24 items-center gap-4 px-4 py-2"
                    >
                        <span data-testid="shape-groups-summary">{label}</span>
                        <CaretDownIcon size={10} />
                    </button>
                </Popover.Trigger>
            </Tip>
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    {...focus.content}
                    aria-label={tolgee.t(
                        "shapes.groups.menuName",
                        "Interval groups",
                    )}
                    // Esc in a number or the list being typed is theirs: it puts the typing back
                    // and leaves the menu open. Radix hears it first, on the document
                    onEscapeKeyDown={(e) => {
                        if (
                            (e.target as Element | null)?.closest?.(
                                "[data-editing]",
                            )
                        )
                            e.preventDefault();
                    }}
                    // Focus back on the button isn't leaving: its tooltip closing can put it there.
                    // Found by its mark, as the tooltip may have drawn the button again
                    onFocusOutside={(e) => {
                        if (
                            (e.target as Element | null)?.closest?.(
                                "[data-group-menu-trigger]",
                            )
                        )
                            e.preventDefault();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded-6 border-stroke bg-bg-1 bg-modal text-sub text-text shadow-modal z-50 flex flex-col gap-4 border p-6"
                    data-testid="shape-groups-content"
                    {...{ [GROUP_MENU_ATTRIBUTE]: "" }}
                >
                    <ListField
                        text={(stepPx) =>
                            edits.kindGroups.text(
                                target.params,
                                target.spots,
                                stepPx,
                            )
                        }
                        envFor={envFor}
                        onType={edits.typeList}
                    />
                    <div
                        className="flex flex-col"
                        data-testid="shape-groups"
                        onPointerLeave={() => setHovered(null)}
                    >
                        {groups.map((g, i) => (
                            <div
                                key={i}
                                className={clsx(
                                    "rounded-4 flex min-h-24 items-center gap-6 px-4",
                                    lit === i && "bg-fg-2",
                                    g.dropped && "opacity-50",
                                )}
                                onPointerEnter={() => setHovered(i)}
                                onFocus={() => setFocused(i)}
                                onBlur={leaveRow(i)}
                                data-testid={`shape-group-${i}`}
                                data-rest={g.rest || undefined}
                                data-grown={g.grown || undefined}
                                data-dropped={g.dropped || undefined}
                                data-lit={lit === i || undefined}
                            >
                                <span
                                    className="size-8 shrink-0 rounded-full"
                                    style={{ background: groupColor(i) }}
                                    data-testid={`shape-group-${i}-color`}
                                    data-color={groupColor(i)}
                                    aria-hidden
                                />
                                <span
                                    className="text-text/60 min-w-[96px]"
                                    data-testid={`shape-group-${i}-marchers`}
                                >
                                    {places[i]}
                                </span>
                                <span className="flex items-center gap-2">
                                    {g.rest && (
                                        <span className="text-text/60">
                                            {tolgee.t(
                                                "shapes.groups.theRest",
                                                "the rest,",
                                            )}
                                        </span>
                                    )}
                                    <span
                                        className={clsx(
                                            g.rest && "text-text/60",
                                        )}
                                    >
                                        <ScrubNumber
                                            display={g.count}
                                            axis="x"
                                            label={countLabel(g, i)}
                                            testId={`shape-group-${i}-count`}
                                            {...scrub(i, "count")}
                                            onType={(text) =>
                                                type(i, "count", text)
                                            }
                                        />
                                    </span>
                                    {g.grown > 0 && (
                                        <Tip
                                            label={tolgee.t(
                                                "shapes.groups.grown",
                                                "Grew by {count} to take the marchers no group has",
                                                { count: g.grown },
                                            )}
                                        >
                                            <span
                                                className="text-accent"
                                                data-testid={`shape-group-${i}-grown`}
                                            >
                                                +{g.grown}
                                            </span>
                                        </Tip>
                                    )}
                                    <span className="text-text/60">
                                        {tolgee.t("shapes.groups.at", "at")}
                                    </span>
                                    <ScrubNumber
                                        display={g.interval}
                                        axis="x"
                                        label={tolgee.t(
                                            "shapes.groups.interval",
                                            "Group {n} spacing, in steps",
                                            { n: i + 1 },
                                        )}
                                        testId={`shape-group-${i}-interval`}
                                        {...scrub(i, "interval")}
                                        onType={(text) =>
                                            type(i, "interval", text)
                                        }
                                    />
                                    <span className="text-text/60">
                                        {tolgee.t("shapes.edit.steps", "steps")}
                                    </span>
                                </span>
                                <span className="ml-auto">
                                    <GroupButton
                                        label={tolgee.t(
                                            "shapes.groups.remove",
                                            "Remove group {n}",
                                            { n: i + 1 },
                                        )}
                                        testId={`shape-group-${i}-remove`}
                                        onClick={() => {
                                            remove(i);
                                            // The row that moves up isn't the one pointed at
                                            setHovered(null);
                                            setFocused(null);
                                        }}
                                    >
                                        <XIcon size={10} />
                                    </GroupButton>
                                </span>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={add}
                        data-testid="shape-group-add"
                        className="rounded-4 hover:text-accent flex min-h-24 items-center gap-4 px-4 py-2 text-left"
                    >
                        <PlusIcon size={12} />
                        {tolgee.t("shapes.groups.addGroup", "Add group")}
                    </button>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

/**
 * The whole list as typed (`2*3+4*2`), at the top of the group menu: Enter applies a list typed
 * over it (a plain `2` is everyone at 2), Esc puts it back. Not understood, it stays to fix; left,
 * a list understood is applied and one that isn't goes.
 */
function ListField({
    text,
    envFor,
    onType,
}: {
    text: (stepPx: number) => string;
    envFor: () => ToolEnv | null;
    onType: (text: string) => boolean;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const [wrong, setWrong] = useState(false);
    const stepPx = envFor()?.stepPx;
    const shown = draft ?? (stepPx ? text(stepPx) : "");
    // No tooltip: focused, it would cover the menu's button
    const label = tolgee.t(
        "shapes.groups.list",
        "All groups as a list: count * steps, + between groups",
    );
    return (
        <input
            type="text"
            inputMode="decimal"
            spellCheck={false}
            aria-label={label}
            aria-invalid={wrong || undefined}
            value={shown}
            data-group-list
            data-editing={draft !== null || undefined}
            data-testid="shape-groups-list"
            onChange={(e) => {
                setDraft(e.target.value);
                setWrong(false);
            }}
            onBlur={() => {
                if (draft !== null) onType(draft);
                setDraft(null);
                setWrong(false);
            }}
            onKeyDown={(e) => {
                // Esc with nothing typed closes the menu (the popover's own Esc)
                if (e.key === "Escape" && draft === null) return;
                // The keys are the list's: Enter doesn't also place the shape, nor Space play
                e.stopPropagation();
                if (e.key === "Enter") {
                    if (draft === null || onType(draft)) setDraft(null);
                    else setWrong(true);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft(null);
                    setWrong(false);
                }
            }}
            className={clsx(
                "rounded-4 border-stroke bg-bg-1 w-full border px-6 py-2 font-mono",
                wrong && "border-red",
            )}
        />
    );
}
