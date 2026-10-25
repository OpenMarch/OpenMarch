import { Checkpoint } from "@openmarch/core";

/**
 * How many steps from the center front the field's Y grid lines are anchored.
 *
 * The grid starts from the front checkpoint, unless the front-most visible checkpoint
 * is a fractional number of steps from the front. Then the grid starts from that
 * checkpoint so it lines up with fields whose hashes aren't on a whole step.
 * Coordinate rounding uses the same anchor so marchers snap onto the drawn lines.
 */
export function gridYAnchorSteps(
    yCheckpoints: readonly Pick<
        Checkpoint,
        "stepsFromCenterFront" | "visible"
    >[],
): number {
    if (yCheckpoints.length === 0) return 0;
    const sortedYCheckpoints = [...yCheckpoints].sort(
        (a, b) => b.stepsFromCenterFront - a.stepsFromCenterFront,
    );
    const firstVisibleYCheckpoint = sortedYCheckpoints.reduce(
        (prev, curr) =>
            curr.visible &&
            curr.stepsFromCenterFront > prev.stepsFromCenterFront
                ? curr
                : prev,
        sortedYCheckpoints[sortedYCheckpoints.length - 1],
    );
    if (
        firstVisibleYCheckpoint.stepsFromCenterFront !== 0 &&
        firstVisibleYCheckpoint.stepsFromCenterFront % 1 !== 0
    )
        return firstVisibleYCheckpoint.stepsFromCenterFront;
    return sortedYCheckpoints[0].stepsFromCenterFront;
}
