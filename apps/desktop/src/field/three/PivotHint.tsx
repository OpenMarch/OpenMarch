import { useEffect, useState } from "react";
import { T } from "@tolgee/react";
import Shortcut from "@/components/ui/Shortcut";
import type { SelectionPivot } from "@/field/editor/fieldEditor";
import { CHIP_CLASS, CHIP_PX } from "./HeldRolesChip";
import { fieldToElement, useFieldViewStore } from "./fieldView";

/** How long the pointer rests on the center dot before its hint shows, as a tooltip waits */
const REST_MS = 500;
const OFFSET_X = 14;
const OFFSET_Y = 12;

/**
 * What the selection's pivot does, beside it, in the held-key chip's look: resting on the center
 * dot, that $mod-drag pulls it out (a plain drag there moves the group, so the gesture is
 * otherwise invisible); out of the center, that it drags and a double-click sends it back; while
 * picking it on the field, what the click does and that Escape cancels.
 */
export function PivotHint({ pivot }: { pivot: SelectionPivot | null }) {
    const view = useFieldViewStore();
    const kind = pivot?.picking ? "picking" : (pivot?.hover ?? null);
    // Armed ($mod already held) and picking say what happens now; the rest wait, as a tooltip does
    const waits = kind === "center" || kind === "own";
    const [rested, setRested] = useState<string | null>(null);
    useEffect(() => {
        if (!waits || !kind) return;
        const timer = window.setTimeout(() => setRested(kind), REST_MS);
        return () => window.clearTimeout(timer);
    }, [kind, waits]);
    if (!pivot || !kind || (waits && rested !== kind)) return null;
    const anchor = kind === "picking" ? pivot.preview : pivot.at;
    if (!anchor) return null;
    const p = fieldToElement(view, anchor.x, anchor.y);
    return (
        <div
            className={`${CHIP_CLASS} pointer-events-none absolute z-20`}
            style={{
                left: p.x + OFFSET_X,
                top: p.y + OFFSET_Y,
                fontSize: CHIP_PX,
            }}
            data-testid="fieldPivotHint"
            data-kind={kind}
        >
            {kind === "own" ? (
                <T keyName="field.pivotHint.own" />
            ) : kind === "picking" ? (
                <T
                    keyName="field.pivotHint.picking"
                    params={{ keys: () => <Shortcut keys={["Esc"]} /> }}
                />
            ) : (
                <T
                    keyName="field.pivotHint.pull"
                    params={{ keys: () => <Shortcut binding="$mod+drag" /> }}
                />
            )}
        </div>
    );
}
