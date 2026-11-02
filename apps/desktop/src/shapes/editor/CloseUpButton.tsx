import clsx from "clsx";
import { Tip } from "@/components/ui/Tip";
import tolgee from "@/global/singletons/Tolgee";
import { ArrowsInIcon } from "@phosphor-icons/react";
import type { ShapeEditTarget } from "./editTargets";
import { keepFocus } from "./keepFocus";

/**
 * Close up (#392, spec #385): a placed shape with holes laid out again for the members it has
 * left, in its mode and settings, by least travel. In the floating editor (an icon) and the
 * inspector; shown only while the shape has holes. One change (one undo step).
 */
export function CloseUpButton({
    target,
    className,
    compact = false,
    testId,
}: {
    target: Pick<ShapeEditTarget, "closeUp" | "empty">;
    className?: string;
    /** The icon alone, its words in the tooltip (the floating editor, #429) */
    compact?: boolean;
    testId: string;
}) {
    if (!target.closeUp) return null;
    const title = tolgee.t(
        "shapes.edit.closeUp.title",
        "Close up: fill the {count, plural, one {# empty spot} other {# empty spots}} with the marchers left",
        { count: target.empty },
    );
    return (
        <Tip label={title}>
            <button
                type="button"
                aria-label={compact ? title : undefined}
                onPointerDown={keepFocus}
                // Read at the click: the floating editor doesn't redraw this for every edit (#455)
                onClick={() => target.closeUp?.()}
                data-testid={testId}
                className={clsx("flex items-center gap-4", className)}
            >
                <ArrowsInIcon size={14} />
                {!compact && tolgee.t("shapes.edit.closeUp.label", "Close up")}
            </button>
        </Tip>
    );
}
