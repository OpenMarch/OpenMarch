import { useEffect, useMemo, useRef } from "react";
import type { Checkpoint, FieldProperties } from "@openmarch/core";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { CrosshairSimpleIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { fieldEditMode, useFieldEditModeStore } from "../fieldEditModeStore";
import { lineKey, linesOn, sameLine, toRef, type FieldLineRef } from "../lines";
import {
    clickLine,
    rangeOf,
    selectionWithTwins,
    type LineSelection,
} from "../lineSelection";
import { useWhereText, type LineWhere } from "./lineWhere";

/** One row of the list: a line, or with Mirror on an X line and its twin */
export interface LineRow {
    /** The line the row picks and edits (side 2's of a pair, or the center) */
    readonly lead: Checkpoint;
    readonly lines: readonly Checkpoint[];
    /** Steps from the center (X) or behind the front (Y) */
    readonly distance: number;
    readonly where: LineWhere;
}

/**
 * The list's rows (#824): Y back to front, top to bottom as the field is drawn; X side 1 to side 2, or with Mirror on, the pairs as one
 * row from the center out (a line without a twin keeps its own row, after its pair's place).
 */
export function lineRows(
    fp: FieldProperties,
    axis: "x" | "y",
    mirror: boolean,
): LineRow[] {
    const lines = linesOn(fp, axis);
    if (axis === "y")
        return [...lines].reverse().map((c) => ({
            lead: c,
            lines: [c],
            distance: Math.abs(c.stepsFromCenterFront),
            where: "y",
        }));
    const side = (c: Checkpoint): LineRow["where"] =>
        Math.abs(c.stepsFromCenterFront) < 1e-6
            ? "center"
            : c.stepsFromCenterFront < 0
              ? "left"
              : "right";
    if (!mirror)
        return lines.map((c) => ({
            lead: c,
            lines: [c],
            distance: Math.abs(c.stepsFromCenterFront),
            where: side(c),
        }));
    const rows: LineRow[] = [];
    const taken = new Set<number>();
    const byDistance = [...lines].sort(
        (a, b) =>
            Math.abs(a.stepsFromCenterFront) -
                Math.abs(b.stepsFromCenterFront) ||
            b.stepsFromCenterFront - a.stepsFromCenterFront,
    );
    for (const c of byDistance) {
        if (taken.has(c.id)) continue;
        taken.add(c.id);
        const twin = lines.find(
            (o) =>
                !taken.has(o.id) &&
                Math.abs(o.stepsFromCenterFront + c.stepsFromCenterFront) <
                    1e-6 &&
                Math.abs(c.stepsFromCenterFront) > 1e-6,
        );
        if (twin) taken.add(twin.id);
        rows.push({
            lead: c,
            lines: twin ? [c, twin] : [c],
            distance: Math.abs(c.stepsFromCenterFront),
            where: twin ? "both" : side(c),
        });
    }
    return rows;
}

/**
 * Whether the outermost X lines are different distances from the center. The field is drawn
 * centered between them (B8), so the 50 then isn't where the lines say it is.
 */
export function xLinesAsymmetric(fp: Pick<FieldProperties, "xCheckpoints">) {
    if (fp.xCheckpoints.length === 0) return false;
    const xs = fp.xCheckpoints.map((c) => c.stepsFromCenterFront);
    return Math.abs(Math.min(0, ...xs) + Math.max(0, ...xs)) > 1e-6;
}

/**
 * The Lines tab's list of lines on one axis (#824), one line per row like the Marchers list (a
 * mirrored pair is one row). It's for finding and picking: a click picks a row, Ctrl/⌘-click adds
 * or takes it away, Shift-click picks the rows from the last pick to it, and a double-click goes
 * to its position in the Line section. Rows share the field's pick and hover. They show a hidden
 * line (an eye-slash) and a reference line (a crosshair) but change nothing themselves: the Line
 * section is where a line's values change.
 */
export function LinesList({
    fp,
    axis,
}: {
    fp: FieldProperties;
    axis: "x" | "y";
}) {
    const { t } = useTranslate();
    const mirror = useFieldEditModeStore((s) => s.mirror);
    const selection = useFieldEditModeStore((s) => s.selection);
    const hover = useFieldEditModeStore((s) => s.hover);
    const whereText = useWhereText(fp);
    const list = useRef<HTMLDivElement>(null);
    const lit = useMemo(
        () =>
            new Set(
                selectionWithTwins(fp, selection, mirror).map((r) =>
                    lineKey(r),
                ),
            ),
        [fp, selection, mirror],
    );
    const rows = lineRows(fp, axis, mirror);
    // A line picked on the field (or by Tab) scrolls its row into view
    const last = selection[selection.length - 1];
    const lastKey = last ? lineKey(last) : null;
    useEffect(() => {
        if (!lastKey) return;
        const row = [
            ...(list.current?.querySelectorAll<HTMLElement>(
                "[data-field-line-row]",
            ) ?? []),
        ].find((el) => el.dataset.fieldLineKeys?.split(" ").includes(lastKey));
        row?.scrollIntoView?.({ block: "nearest" });
    }, [lastKey]);

    const pick = (row: LineRow, event: React.MouseEvent) => {
        const ref = toRef(row.lead);
        const leads = rows.map((r) => toRef(r.lead));
        let next: LineSelection;
        if (event.shiftKey) next = rangeOf(leads, selection, ref);
        else
            next = clickLine(
                selection,
                ref,
                event.ctrlKey ||
                    event.metaKey ||
                    fieldEditMode.get().selectMany,
            );
        fieldEditMode.select(next);
    };
    return (
        <div
            ref={list}
            className="flex flex-col"
            role="listbox"
            data-field-line-list
            aria-multiselectable
            aria-label={t(
                axis === "x"
                    ? "fieldEditMode.list.xHeading"
                    : "fieldEditMode.list.yHeading",
            )}
            data-testid={`field-lines-${axis}`}
        >
            {rows.map((row) => {
                const ref = toRef(row.lead);
                const selected = row.lines.some((c) =>
                    lit.has(lineKey(toRef(c))),
                );
                const hovered =
                    hover !== null &&
                    row.lines.some((c) => sameLine(hover, toRef(c)));
                return (
                    <div
                        key={lineKey(ref)}
                        role="option"
                        aria-selected={selected}
                        tabIndex={-1}
                        data-field-line-row={lineKey(ref)}
                        data-field-line-keys={row.lines
                            .map((c) => lineKey(toRef(c)))
                            .join(" ")}
                        className={clsx(
                            "rounded-6 touch:min-h-44 grid min-h-32 cursor-default grid-cols-[2.5rem_minmax(0,1fr)_auto_2.5rem] items-center gap-8 border px-12 select-none",
                            selected
                                ? "border-stroke bg-fg-2"
                                : hovered
                                  ? "bg-text/5 border-transparent"
                                  : "hover:bg-text/5 border-transparent",
                            !row.lead.visible && "text-text-subtitle",
                        )}
                        onClick={(e) => pick(row, e)}
                        onDoubleClick={() => fieldEditMode.editPosition(ref)}
                        onPointerEnter={() => fieldEditMode.setHover(ref)}
                        onPointerLeave={() => fieldEditMode.setHover(null)}
                    >
                        <span
                            className={clsx(
                                "text-body truncate font-mono",
                                selected && "text-accent",
                            )}
                        >
                            {row.lead.terseName}
                        </span>
                        <span className="text-body truncate">
                            {row.lead.name}
                        </span>
                        <span className="text-sub text-text-subtitle truncate tabular-nums">
                            {whereText(
                                row.where,
                                row.lead.stepsFromCenterFront,
                            )}
                        </span>
                        <span className="text-text-subtitle flex items-center justify-end gap-4">
                            {!row.lead.visible && (
                                <EyeSlashIcon
                                    size={14}
                                    role="img"
                                    aria-label={t("fieldEditMode.list.hidden")}
                                />
                            )}
                            {row.lead.useAsReference && (
                                <CrosshairSimpleIcon
                                    size={14}
                                    role="img"
                                    aria-label={t(
                                        "fieldEditMode.list.reference",
                                    )}
                                />
                            )}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export type { FieldLineRef };
