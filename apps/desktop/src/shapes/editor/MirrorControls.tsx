import { cloneElement, memo, type ReactElement } from "react";
import { keepFocus } from "./keepFocus";
import { SegmentedTextSwitch } from "@openmarch/ui";
import tolgee from "@/global/singletons/Tolgee";
import { Tip } from "@/components/ui/Tip";
import { runAction } from "@/shortcuts/registry";
import type { ActionId } from "@/shortcuts/definitions";
import type { MirrorAxes } from "../tool/mirror";

/** The Mirror choice's three ways */
type MirrorWay = "across" | "deep" | "both";

const wayOf = ({ across, deep }: MirrorAxes): MirrorWay =>
    across && deep ? "both" : deep ? "deep" : "across";

/** The action each way runs, as the command palette does */
const ACTION: Record<MirrorWay, ActionId> = {
    across: "mirrorSideToSide",
    deep: "mirrorFrontToBack",
    both: "mirrorBoth",
};

/**
 * A small picture of a way to mirror: the mirror line (dashed, or both lines for Both) with a dot
 * on one side and its mirror image on the other
 */
function WayPicture({ way }: { way: MirrorWay }) {
    const dot = (x: number, y: number, image = false) => (
        <circle
            cx={x}
            cy={y}
            r={1.8}
            fill="currentColor"
            opacity={image ? 0.55 : 1}
        />
    );
    return (
        <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            aria-hidden
            className="shrink-0"
        >
            {way !== "deep" && (
                <line
                    x1={8}
                    y1={1}
                    x2={8}
                    y2={15}
                    stroke="currentColor"
                    strokeWidth={1.2}
                    strokeDasharray="2 1.6"
                />
            )}
            {way !== "across" && (
                <line
                    x1={1}
                    y1={8}
                    x2={15}
                    y2={8}
                    stroke="currentColor"
                    strokeWidth={1.2}
                    strokeDasharray="2 1.6"
                />
            )}
            {dot(4, 4)}
            {way === "across" && dot(12, 4, true)}
            {way === "deep" && dot(4, 12, true)}
            {way === "both" && dot(12, 12, true)}
        </svg>
    );
}

/**
 * A mirrored paste's whole floating editor before Pathways and Place (Paste mirrored, owner: the
 * mirror paste only mirrors): which way it mirrors through the mirror point, side to side (across
 * the upright line), front to back (across the level line) or both, each segment running its
 * action. Moving it, its point or Recalculate is all else there is.
 */
export const MirrorControls = memo(function MirrorControls({
    axes,
}: {
    axes: MirrorAxes;
}) {
    const label = tolgee.t("shapes.edit.mirror.label", "Mirror");
    const option = (way: MirrorWay, text: string, tip: string) => ({
        value: way,
        testId: `shape-editor-mirror-${way}`,
        label: (
            <span className="flex items-center gap-4">
                <WayPicture way={way} />
                {text}
            </span>
        ),
        // The segment itself is the tooltip's trigger: it opens on focus and describes the segment
        // to screen readers. A press doesn't take the focus, so the arrow keys still move the
        // mirror point after a click
        wrap: (item: ReactElement) => (
            <Tip label={tip}>
                {cloneElement(item, {
                    onPointerDown: keepFocus,
                } as Partial<unknown>)}
            </Tip>
        ),
    });
    return (
        <span
            className="flex items-center gap-6"
            data-testid="shape-editor-mirror"
        >
            <span className="text-text/60">{label}</span>
            <SegmentedTextSwitch
                ariaLabel={label}
                testId="shape-editor-mirror-way"
                selected={wayOf(axes)}
                setSelected={(way) => runAction(ACTION[way as MirrorWay])}
                options={[
                    option(
                        "across",
                        tolgee.t("shapes.edit.mirror.across", "Side to side"),
                        tolgee.t(
                            "shapes.edit.mirror.acrossTip",
                            "Mirror across the upright line through the mirror point: side 1 and side 2 swap",
                        ),
                    ),
                    option(
                        "deep",
                        tolgee.t("shapes.edit.mirror.deep", "Front to back"),
                        tolgee.t(
                            "shapes.edit.mirror.deepTip",
                            "Mirror across the level line through the mirror point: front and back swap",
                        ),
                    ),
                    option(
                        "both",
                        tolgee.t("shapes.edit.mirror.both", "Both"),
                        tolgee.t(
                            "shapes.edit.mirror.bothTip",
                            "Mirror across both lines: half a turn around the mirror point",
                        ),
                    ),
                ]}
            />
        </span>
    );
});
