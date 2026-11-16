import type { FieldProperties } from "@openmarch/core";
import { WarningIcon } from "@phosphor-icons/react";
import tolgee from "@/global/singletons/Tolgee";
import { Tip } from "@/components/ui/Tip";
import { StepSize } from "@/global/classes/StepSize";
import type { XY } from "@/shapes/types";
import {
    followPlanOf,
    keepsEndSpots,
    rippleDrawnPlanOf,
    ripplesIn,
} from "./followDrag";
import {
    memberNow,
    shapeOf,
    usePathPenStore,
    type PathSession,
} from "./pathPenStore";
import {
    curveOf,
    groupLegDistances,
    memberWalkOf,
    scheduleOf,
    type LegWhere,
} from "./pathEdit";

/**
 * Big steps for a drawn path (pathways): the verdict, its words, and its line in the marcher
 * inspector (interaction round 2: on the path bar it read as an error). Kept apart from the path
 * bar so the inspector doesn't load the pen's field mode.
 */

/**
 * The Big steps advice for a path (spec v0.9 Appendix I.2, I.5): one steady speed means every leg
 * has the same step size, the path's length (curves included) over the move's counts, tested as
 * straight moves are (`StepSize`, the field's step-size warning). Null when the steps aren't big,
 * or with the warning off.
 */
export function bigSteps(
    session: PathSession,
    fieldProperties: FieldProperties,
): BigSteps | null {
    const { target } = session;
    const counts = target.end - target.start;
    if (target.trail) return trailBigSteps(session, fieldProperties);
    if (target.group) return groupBigSteps(session, fieldProperties);
    const size = StepSize.fromDistance({
        marcher_id: target.marcherId,
        distance: curveOf(shapeOf(session)).L,
        counts,
        fieldProperties,
    });
    if (!size.exceedsThreshold(fieldProperties.stepSizeWarningThresholdInches))
        return null;
    return {
        steps: size.displayString(),
        inches: Math.round(size.inchesPerStep),
        where: null,
        legs: [],
    };
}

/**
 * How far each member of a trail's line walks (R-9′, R-10): the rest of the line-up from where it
 * stands, the drawn part, then the end line as far as its own spot. Tail first, as the members.
 */
export function trailDistances(
    members: readonly { from: XY; to: XY }[],
    drawnLength: number,
): number[] {
    const along = (points: readonly XY[]) => {
        const cum = [0];
        for (let i = 1; i < points.length; i++)
            cum.push(
                cum[i - 1]! +
                    Math.hypot(
                        points[i]!.x - points[i - 1]!.x,
                        points[i]!.y - points[i - 1]!.y,
                    ),
            );
        return cum;
    };
    const lineUp = along(members.map((m) => m.from));
    const endLine = along(members.map((m) => m.to));
    const lineLength = lineUp.at(-1) ?? 0;
    return members.map(
        (_, q) => lineLength - lineUp[q]! + drawnLength + endLine[q]!,
    );
}

/**
 * Big steps on a trail (pathways step 4): each member walks its own distance at its own steady
 * speed (R-10), so each is tested as a straight move is, and the worst is named.
 */
function trailBigSteps(
    session: PathSession,
    fieldProperties: FieldProperties,
): BigSteps | null {
    const { target } = session;
    const trail = target.trail!;
    const counts = target.end - target.start;
    // A trail dragged out (step 4b): each walks the way to where it stops (R-13″). With Keep
    // end spots it is step 4's trail into the spots they have, read as step 4 reads it (AP-T9)
    const plan =
        session.follow && !keepsEndSpots(session.follow)
            ? ripplesIn(session.follow)
                ? rippleDrawnPlanOf(session)
                : followPlanOf(session)
            : null;
    // Ripple in (step 9): each member's whole way into the next form, the connector included
    const distances = plan
        ? ("endDist" in plan ? plan.endDist : plan.ends).map(
              (e, q) => e - plan.startDist[q]!,
          )
        : trailDistances(trail.members, curveOf(shapeOf(session)).L);
    const threshold = fieldProperties.stepSizeWarningThresholdInches;
    let worst: { size: StepSize; drill: string } | null = null;
    trail.members.forEach((m, q) => {
        const size = StepSize.fromDistance({
            marcher_id: m.marcherId,
            distance: distances[q]!,
            counts,
            fieldProperties,
        });
        if (!size.exceedsThreshold(threshold)) return;
        if (!worst || size.inchesPerStep > worst.size.inchesPerStep)
            worst = { size, drill: m.drill };
    });
    if (!worst) return null;
    const { size, drill } = worst as { size: StepSize; drill: string };
    return {
        steps: size.displayString(),
        inches: Math.round(size.inchesPerStep),
        where: null,
        legs: [],
        marcher: drill,
    };
}

/** Big steps' verdict: the worst big leg, and every big leg (a group path's, step 15) */
export interface BigSteps {
    steps: string;
    inches: number;
    /** Which leg of a group path is worst; null for one marcher's own path */
    where: LegWhere | null;
    /** The worst leg itself, for its words */
    worst?: BigSteps["legs"][number];
    /** On a trail (step 4): whose steps are the biggest */
    marcher?: string;
    legs: {
        where: LegWhere;
        drill: string | null;
        steps: string;
        /** Its inches in a step, to find the worst of some legs (the inspector's) */
        inches?: number;
        /** An adjusted stretch (J.6): its spot and the counts it runs over */
        spot?: number;
        from?: number;
        to?: number;
    }[];
}

/**
 * Big steps on a group path (spec Appendix I.8): each member's first leg onto the path, the middle
 * along it (the same for every member, judged once) and each member's last leg off it, each with
 * the straight moves' test. A leg whose speed is unbounded (its time rounds to nothing) is big.
 */
function groupBigSteps(
    session: PathSession,
    fieldProperties: FieldProperties,
): BigSteps | null {
    const { target } = session;
    const group = target.group!;
    const counts = target.end - target.start;
    const schedule = scheduleOf(shapeOf(session));
    const points = shapeOf(session).points;
    const walks = group.members.map((m) => ({
        marcherId: m.marcherId,
        walk: memberWalkOf(schedule, memberNow(session, m), points),
    }));
    const drill = new Map(group.members.map((m) => [m.marcherId, m.drill]));
    const slots = new Map(group.members.map((m) => [m.marcherId, m.slot ?? 0]));
    const L = schedule.W.L;
    const tenth = (v: number) => Math.round(v * 10) / 10;
    const threshold = fieldProperties.stepSizeWarningThresholdInches;
    const big: (BigSteps["legs"][number] & { inches: number })[] = [];
    for (const leg of groupLegDistances(schedule, walks)) {
        const size = StepSize.fromDistance({
            marcher_id: leg.marcherId ?? target.marcherId,
            distance: Number.isFinite(leg.distance)
                ? leg.distance
                : Number.MAX_SAFE_INTEGER,
            counts,
            fieldProperties,
        });
        if (!size.exceedsThreshold(threshold)) continue;
        big.push({
            where: leg.where,
            drill:
                leg.marcherId === null
                    ? null
                    : (drill.get(leg.marcherId) ?? null),
            steps: size.displayString(),
            inches: size.inchesPerStep,
            ...(leg.x0 === undefined || leg.x1 === undefined
                ? {}
                : {
                      spot: (slots.get(leg.marcherId ?? -1) ?? 0) + 1,
                      from: tenth((leg.x0 / L) * counts),
                      to: tenth((leg.x1 / L) * counts),
                  }),
        });
    }
    if (big.length === 0) return null;
    const worst = big.reduce((a, b) => (b.inches > a.inches ? b : a));
    return {
        steps: worst.steps,
        inches: Math.round(worst.inches),
        where: worst.where,
        worst,
        legs: big.map((leg) => ({ ...leg, inches: Math.round(leg.inches) })),
    };
}

/** How Big steps names a leg of a group path */
const legWords = (
    leg: Pick<BigSteps["legs"][number], "where" | "drill" | "from" | "to">,
) => {
    const { where } = leg;
    if (where === "adjusted")
        return tolgee.t(
            "pathways.editor.legAdjusted",
            "{marcher}'s bent line, counts {from} to {to}",
            { marcher: leg.drill ?? "", from: leg.from ?? 0, to: leg.to ?? 0 },
        );
    return where === "onto"
        ? tolgee.t("pathways.editor.legOnto", "joining the path")
        : where === "off"
          ? tolgee.t("pathways.editor.legOff", "leaving the path")
          : where === "straight"
            ? tolgee.t("pathways.editor.legStraight", "straight to the spot")
            : tolgee.t("pathways.editor.legAlong", "on the path");
};

/**
 * Big steps for the path shown, in the marcher inspector under the step sizes (interaction round
 * 2: on the path bar it read as an error). Its tooltip says where and what to do. Nothing when the
 * steps aren't big.
 */
export function PathBigStepsLine({
    fieldProperties,
}: {
    fieldProperties: FieldProperties;
}) {
    const session = usePathPenStore((s) => s.session);
    const selected = usePathPenStore((s) => s.ownable);
    const all = session ? bigSteps(session, fieldProperties) : null;
    const big = session && all ? forSelection(all, session, selected) : null;
    if (!big) return null;
    return (
        <div className="flex justify-between px-6">
            <span className="text-body leading-none opacity-80">
                {tolgee.t("pathways.inspector.path", "Path")}
            </span>
            <Tip label={bigStepsTip(big)}>
                <span
                    className="text-body flex items-center gap-4 leading-none"
                    data-testid="path-big-steps"
                >
                    <WarningIcon
                        size={14}
                        weight="bold"
                        className="text-yellow"
                        aria-hidden
                    />
                    {bigStepsShort(big)}
                </span>
            </Tip>
        </div>
    );
}

/** Big steps' tooltip: who or where, and what to do about it */
function bigStepsTip(big: NonNullable<ReturnType<typeof bigSteps>>): string {
    if (big.marcher !== undefined)
        return tolgee.t(
            "pathways.editor.bigStepsTipTrail",
            "{marcher} has the farthest to go: {inches} in a step. Each marcher walks its own way along the trail at a steady speed. Lengthen the move, or shorten the trail.",
            { marcher: big.marcher, inches: big.inches },
        );
    if (big.where === null)
        return tolgee.t(
            "pathways.editor.bigStepsTipPoints",
            "{inches} in a step, all along the path. Lengthen the move, or move or take out points to shorten the path.",
            { inches: big.inches },
        );
    return tolgee.t(
        "pathways.editor.bigStepsTipLegs",
        "Big steps {legs}. Every marcher passes each point of the path at the same moment, so only getting onto and off the path changes speed. Lengthen the move, or move points to even them out.",
        {
            legs: big.legs
                .map((l) =>
                    l.drill === null || l.where === "adjusted"
                        ? `${legWords(l)} (${l.steps})`
                        : `${l.drill} ${legWords(l)} (${l.steps})`,
                )
                .join(", "),
        },
    );
}

/**
 * A group path's Big steps for the marchers selected on it (`ownable`): the stretch every member
 * shares, and the selected members' own legs, so the inspector doesn't name a marcher who isn't
 * selected. Nothing when no member is selected (only marchers off it). Other paths as they are.
 */
function forSelection(
    big: BigSteps,
    session: PathSession,
    ownable: readonly number[],
): BigSteps | null {
    const group = session.target.group;
    if (!group || session.target.lane || big.legs.length === 0) return big;
    const drills = new Set(
        group.members
            .filter((m) => ownable.includes(m.marcherId))
            .map((m) => m.drill),
    );
    if (drills.size === 0) return null;
    const legs = big.legs.filter(
        (l) => l.drill === null || drills.has(l.drill),
    );
    if (legs.length === 0) return null;
    if (legs.length === big.legs.length) return big;
    const worst = legs.reduce((a, b) =>
        (b.inches ?? 0) > (a.inches ?? 0) ? b : a,
    );
    return {
        ...big,
        steps: worst.steps,
        inches: worst.inches ?? big.inches,
        where: worst.where,
        worst,
        legs,
    };
}

/** Big steps' words: how big, and where when it's one leg */
function bigStepsShort(big: NonNullable<ReturnType<typeof bigSteps>>): string {
    return big.where === null
        ? tolgee.t("pathways.editor.bigStepsShort", "Big steps · {steps}", {
              steps: big.steps,
          })
        : tolgee.t(
              "pathways.editor.bigStepsLeg",
              "Big steps · {steps} {where}",
              {
                  steps: big.steps,
                  where: legWords(big.worst!),
              },
          );
}
