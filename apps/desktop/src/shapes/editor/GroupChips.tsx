import clsx from "clsx";
import { Fragment, useRef, type ReactNode } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import tolgee from "@/global/singletons/Tolgee";
import type { Roles } from "@/input/modifierRoles";
import type { GroupPart, ToolEnv, ToolGroup } from "../tool/toolKind";
import type { ShapeEditTarget } from "./editTargets";
import { keepFocus } from "./keepFocus";
import { ScrubNumber, type ScrubMove } from "./ScrubNumber";
import { Tip } from "@/components/ui/Tip";

/**
 * A kind's mixed intervals in the floating editor (#526, spec #522): a chip per group,
 * `2 × 3 │ 4 × 2`, its count and interval each typed or dragged like every number, with × to
 * remove the group and + after the last to add one. Typing a whole list (`2*3+4*2`) into any of
 * them replaces the list. The rest shows the marchers it takes, quieter; a group grown to take
 * extra marchers is marked "+4", and one dropped off the end fades.
 */
/** What a group control edits: the open shape, or a placed one, as the editor holds it */
export type GroupTarget = Pick<
    ShapeEditTarget,
    "kind" | "params" | "spots" | "apply" | "begin" | "preview" | "end"
>;

/**
 * The edits of a kind's interval groups, shared by the chips and the group menu: a count or
 * interval typed (a whole list typed there replaces the list), dragged (one undo step from the
 * press through begin, preview and end), a group added or removed. Null for a kind without groups.
 */
export function useGroupEdits(
    target: GroupTarget,
    envFor: (roles?: Roles) => ToolEnv | null,
    onScrubbing?: (on: boolean, index: number, part: GroupPart) => void,
) {
    const kindGroups = target.kind.groups;
    // The shape at the press of a drag
    const base = useRef<unknown>(null);
    if (!kindGroups) return null;

    const type = (index: number, part: GroupPart, text: string) => {
        const env = envFor();
        const next =
            env &&
            kindGroups.type(
                target.params,
                target.spots,
                index,
                part,
                text,
                env,
            );
        if (next == null) return false;
        target.apply(next);
        return true;
    };
    const scrub = (index: number, part: GroupPart) => ({
        onScrubStart: () => {
            base.current = target.params;
            target.begin();
            onScrubbing?.(true, index, part);
        },
        onScrub: (m: ScrubMove) => {
            const env = envFor(m.roles);
            if (env)
                target.preview(
                    kindGroups.scrub(
                        base.current,
                        target.spots,
                        index,
                        part,
                        m,
                        env,
                    ),
                );
        },
        onScrubEnd: (keep: boolean) => {
            onScrubbing?.(false, index, part);
            target.end(keep);
        },
    });
    const change = (edit: (params: unknown, env: ToolEnv) => unknown): void => {
        const env = envFor();
        if (env) target.apply(edit(target.params, env));
    };
    const add = () => change((p, env) => kindGroups.add(p, target.spots, env));
    const remove = (index: number) =>
        change((p, env) => kindGroups.remove(p, target.spots, index, env));
    /** A whole list typed; false keeps it open to fix */
    const typeList = (text: string) => {
        const env = envFor();
        const next =
            env && kindGroups.typeList(target.params, target.spots, text, env);
        if (next == null) return false;
        if (next !== target.params) target.apply(next);
        return true;
    };
    return { kindGroups, type, scrub, add, remove, typeList };
}

/**
 * A kind's mixed intervals in the floating editor (#526, spec #522): a chip per group,
 * `2 × 3 │ 4 × 2`, its count and interval each typed or dragged like every number, with × to
 * remove the group and + after the last to add one. Typing a whole list (`2*3+4*2`) into any of
 * them replaces the list. The rest shows the marchers it takes, quieter; a group grown to take
 * extra marchers is marked "+4", and one dropped off the end fades. With two groups or more the
 * editor shows the group menu instead (`GroupMenu`); the chips are a single counted group's.
 */
export function GroupChips({
    target,
    groups,
    envFor,
    onScrubbing,
}: {
    target: GroupTarget;
    groups: readonly ToolGroup[];
    /** The field's tool environment with `roles` held; null with no field */
    envFor: (roles?: Roles) => ToolEnv | null;
    /** An interval's drag began or ended, for the field to show the lines it lands on */
    onScrubbing?: (on: boolean) => void;
}) {
    const edits = useGroupEdits(target, envFor, (on, _i, part) => {
        if (part === "interval" || !on) onScrubbing?.(on);
    });
    if (!edits) return null;
    const { type, scrub, add, remove } = edits;

    return (
        <span className="flex items-center gap-2" data-testid="shape-groups">
            {groups.map((g, i) => (
                <Fragment key={i}>
                    {i > 0 && (
                        <span className="text-text/40" aria-hidden>
                            │
                        </span>
                    )}
                    <span
                        className={clsx(
                            "flex items-center gap-2",
                            g.dropped && "opacity-50",
                        )}
                        data-testid={`shape-group-${i}`}
                        data-rest={g.rest || undefined}
                        data-grown={g.grown || undefined}
                        data-dropped={g.dropped || undefined}
                    >
                        <span className={clsx(g.rest && "text-text/60")}>
                            <ScrubNumber
                                display={g.count}
                                axis="x"
                                label={countLabel(g, i)}
                                testId={`shape-group-${i}-count`}
                                {...scrub(i, "count")}
                                onType={(text) => type(i, "count", text)}
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
                        <span className="text-text/60" aria-hidden>
                            ×
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
                            onType={(text) => type(i, "interval", text)}
                        />
                        {groups.length > 1 && (
                            <GroupButton
                                label={tolgee.t(
                                    "shapes.groups.remove",
                                    "Remove group {n}",
                                    { n: i + 1 },
                                )}
                                testId={`shape-group-${i}-remove`}
                                onClick={() => remove(i)}
                            >
                                <XIcon size={10} />
                            </GroupButton>
                        )}
                    </span>
                </Fragment>
            ))}
            <GroupButton
                label={tolgee.t("shapes.groups.add", "Add a group")}
                testId="shape-group-add"
                onClick={add}
            >
                <PlusIcon size={12} />
            </GroupButton>
        </span>
    );
}

/** A group's count, named for what it is: typed, the rest, grown or dropped */
export function countLabel(g: ToolGroup, i: number): string {
    const n = i + 1;
    if (g.rest)
        return tolgee.t(
            "shapes.groups.countRest",
            "Group {n}: the rest of the marchers. Type a count to fix it",
            { n },
        );
    if (g.dropped)
        return tolgee.t(
            "shapes.groups.countDropped",
            "Group {n} marchers: none left for it",
            { n },
        );
    return tolgee.t("shapes.groups.count", "Group {n} marchers", { n });
}

export function GroupButton({
    label,
    testId,
    onClick,
    children,
}: {
    label: string;
    testId: string;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Tip label={label}>
            <button
                type="button"
                aria-label={label}
                onPointerDown={keepFocus}
                onClick={onClick}
                data-testid={testId}
                // At least 24 px to hit (WCAG 2.2 target size)
                className="rounded-4 hover:text-accent flex min-h-24 min-w-24 items-center justify-center p-4"
            >
                {children}
            </button>
        </Tip>
    );
}
