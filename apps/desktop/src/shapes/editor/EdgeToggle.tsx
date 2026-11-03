import clsx from "clsx";
import { SelectionIcon } from "@phosphor-icons/react";
import { Tip } from "@/components/ui/Tip";
import tolgee from "@/global/singletons/Tolgee";
import { distributionOf, edgeSplitOf, withEdge } from "../distribute/modes";
import type { ToolEnv } from "../tool/toolKind";
import type { ShapeEditTarget } from "./editTargets";
import { keepFocus } from "./keepFocus";

/**
 * Spread with an edge (#450): a toggle beside Reshuffle on the floating editor's second row, in
 * Spread only, for a shape with an edge to follow (a box, a circle). On, some marchers stand
 * evenly along the outline and the rest spread inside it, so the shape reads clearly; the frame
 * stays. Its tip says how many stand where, or that there are too few for an inside. One change
 * (one undo step, or one save for a placed shape).
 */
export function EdgeToggle({
    target,
    envFor,
    className,
    testId,
}: {
    target: Pick<ShapeEditTarget, "kind" | "params" | "spots" | "apply">;
    /** The field's tool environment when it's pressed; null with no field */
    envFor: () => ToolEnv | null;
    className?: string;
    testId: string;
}) {
    const d = distributionOf(target.kind, target.params, target.spots);
    if (d?.mode !== "spread") return null;
    const on = d.edge === true;
    // The split it has, or would have turned on
    const split = edgeSplitOf(
        target.kind,
        on
            ? target.params
            : {
                  ...(target.params as object),
                  distribution: { ...d, edge: true },
              },
        target.spots,
    );
    if (split === null) return null;
    const tip =
        split.inside === 0
            ? tolgee.t(
                  "shapes.edit.edge.tipEdgeOnly",
                  "Edge: too few marchers for an inside, so all {edge} stand on the edge",
                  { edge: split.edge },
              )
            : tolgee.t(
                  "shapes.edit.edge.tip",
                  "Edge: {edge} evenly along the outline, {inside} spread inside",
                  { edge: split.edge, inside: split.inside },
              );
    return (
        <Tip label={tip}>
            <button
                type="button"
                aria-pressed={on}
                onPointerDown={keepFocus}
                onClick={() => {
                    const env = envFor();
                    if (!env) return;
                    const next = withEdge(
                        target.kind,
                        target.params,
                        target.spots,
                        !on,
                        env,
                    );
                    if (next !== null && next !== target.params)
                        target.apply(next);
                }}
                data-testid={testId}
                data-state={on ? "on" : "off"}
                className={clsx(
                    "flex items-center gap-4",
                    on && "text-accent",
                    className,
                )}
            >
                <SelectionIcon size={14} weight={on ? "bold" : "regular"} />
                {tolgee.t("shapes.edit.edge.label", "Edge")}
            </button>
        </Tip>
    );
}
