import { useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import { T } from "@tolgee/react";
import {
    ArrowCounterClockwiseIcon,
    ArrowsLeftRightIcon,
    ArrowsMergeIcon,
    ArrowsOutLineHorizontalIcon,
    ArrowsSplitIcon,
    BackspaceIcon,
    FlagPennantIcon,
    PlayIcon,
    LineSegmentsIcon,
    PathIcon,
    PencilSimpleIcon,
    TrashIcon,
    UsersThreeIcon,
    WarningIcon,
    WaveSineIcon,
    XIcon,
} from "@phosphor-icons/react";
import type { FieldProperties } from "@openmarch/core";
import tolgee from "@/global/singletons/Tolgee";
import Shortcut from "@/components/ui/Shortcut";
import { RichTips, Tip } from "@/components/ui/Tip";
import { runAction } from "@/shortcuts/registry";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { getActionShortcutKeys } from "@/shortcuts/labels";
import { StepSize } from "@/global/classes/StepSize";
import { fieldToElement, useFieldViewStore } from "@/field/three/fieldView";
import { editorPlacement } from "@/shapes/editor/editorPlacement";
import {
    Divider,
    EDITOR_BAR,
    EditorButton,
    IconButton,
} from "@/shapes/editor/EditorBarParts";
import type { XY } from "@/shapes/types";
import { prefersReducedMotion } from "@/components/timeline/reducedMotion";
import { refitNeeded } from "./pathTarget";
import { useShapeToolStore } from "@/shapes/tool/shapeToolStore";
import { OffCountWarning, TrailCornerCounts } from "./TrailCornerCounts";
import { offCountTally, trailCornersOf } from "./trailCorners";
import {
    EVEN_FIRST,
    EVEN_STEP,
    evenLimitOf,
    followFootprint,
    followMarchersOf,
    followPlanOf,
    followSpacingOf,
    keepsEndSpots,
    rippleDrawnPlanOf,
    ripplesIn,
    setFollowSpacing,
} from "./followDrag";
import { rippleArrivalCount } from "@/db-functions/timelineTrailRipplePlan";
import {
    detachIdsOf,
    memberNow,
    memberOf,
    groupViewOf,
    resetTargetOf,
    shapeOf,
    usePathPenStore,
    type PathSession,
} from "./pathPenStore";
import { drawingOf } from "./pathPenMode";
import {
    curveOf,
    groupLegDistances,
    besideArc,
    besideArcReason,
    isSmooth,
    memberWalkOf,
    pathOutline,
    pointOf,
    scheduleOf,
    type LegWhere,
} from "./pathEdit";

/** Under a marcher: the field's note there (offset and pill), which the path bar leaves room for */
const FIELD_NOTE_ROOM_PX = 40;
/**
 * The Big steps advice for a path (spec v0.9 Appendix I.2, I.5): one steady speed means every leg
 * has the same step size, the path's length (curves included) over the move's counts, tested as
 * straight moves are (`StepSize`, the field's step-size warning). Null when the steps aren't big,
 * or with the warning off.
 */
/**
 * Reverse leader's tooltip, or why it's off: a dragged-out line ends along its trail, so the
 * other end can't lead (owner, 2026-11-10)
 */
function reverseLabel(along: boolean | undefined): string {
    return along
        ? tolgee.t(
              "timeline.refusals.trail.reverseAlong",
              "Reverse leader is off for a trail dragged out of a line. Drag the trail out of the other end instead.",
          )
        : tolgee.t(
              "pathways.trail.reverseTip",
              "Make the other end of the line lead. Everyone keeps their end spot.",
          );
}

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
        legs: big.map(({ inches: _inches, ...leg }) => leg),
    };
}

/** How Big steps names a leg of a group path */
const legWords = (
    leg: Pick<BigSteps["legs"][number], "where" | "spot" | "from" | "to">,
) => {
    const { where } = leg;
    if (where === "adjusted")
        return tolgee.t(
            "pathways.editor.legAdjusted",
            "spot {spot}, counts {from} to {to} (adjusted)",
            { spot: leg.spot ?? 0, from: leg.from ?? 0, to: leg.to ?? 0 },
        );
    return where === "onto"
        ? tolgee.t("pathways.editor.legOnto", "onto the path")
        : where === "off"
          ? tolgee.t("pathways.editor.legOff", "off the path")
          : where === "straight"
            ? tolgee.t("pathways.editor.legStraight", "straight to the spot")
            : tolgee.t("pathways.editor.legAlong", "along the path");
};

/**
 * The path pen's hint and floating editor (pathways steps 1 and 2). While drawing, a hint over the field
 * says how the pen works, as the shape tool's hint does while a Line's points are clicked. Beside
 * the path, while drawing or with it open (not while it's only shown, closed), the editor: the shape editor's bar and controls
 * (`EditorBarParts`), holding only what a path needs. The Big steps advice when it applies;
 * Remove last point, Cancel and Finish while drawing (a finger has no Enter key); Corner | Smooth for
 * the selected point of an open path; Remove path once it's stored. Each control runs a registered command, its name and shortcut in its tooltip.
 */
export function PathEditor({
    fieldProperties,
}: {
    fieldProperties: FieldProperties;
}) {
    const session = usePathPenStore((s) => s.session);
    const hidden = usePathPenStore((s) => s.hidden);
    const shapeToolOpen = useShapeToolStore((s) => s.tool !== null);
    if (!session) return null;
    // Edit path on a group path: its line is named, so it reads as the shape the lanes follow
    const groupLabel =
        groupViewOf(session) === "edit" ? (
            <GroupPathLabel session={session} />
        ) : null;
    // A quiet path (closed, interaction system rule 4) has the compact bar: Edit path, the member
    // commands and Remove path, so they're found without its menu. A trail keeps its leader's
    // mark, which says who leads and turns the line around (step 4). Not drawn, nothing shows
    if (session.phase === "closed")
        return hidden || shapeToolOpen ? null : (
            <RichTips>
                {session.target.trail && (
                    <>
                        <TrailLeaderMark session={session} />
                        <TrailCornerCounts session={session} />
                    </>
                )}
                {session.target.routeId !== null && (
                    <PathEditorBar
                        session={session}
                        fieldProperties={fieldProperties}
                    />
                )}
            </RichTips>
        );
    return (
        <>
            {groupLabel}
            {session.phase === "drawing" && <PathPenBanner session={session} />}
            {session.target.trail && session.follow?.grabbed !== null && (
                <RichTips>
                    <TrailLeaderMark session={session} />
                </RichTips>
            )}
            {session.target.trail && <TrailCornerCounts session={session} />}
            <RichTips>
                <PathEditorBar
                    session={session}
                    fieldProperties={fieldProperties}
                />
            </RichTips>
        </>
    );
}

/**
 * The leader's mark (pathways step 4): a chip by where the leader starts, naming who leads. On a
 * stored trail its button turns the line around (Reverse, one undo step), also the way for a
 * finger or a pencil. It sits above the leader's dot and takes no room in the path bar.
 */
function TrailLeaderMark({ session }: { session: PathSession }) {
    const view = useFieldViewStore();
    const trail = session.target.trail!;
    const leader = trail.members.at(-1)!;
    const at = fieldToElement(view, leader.from.x, leader.from.y);
    const stored =
        session.target.routeId !== null && session.phase !== "drawing";
    return (
        <div
            className="rounded-6 border-stroke bg-modal text-sub text-text shadow-modal absolute z-10 flex -translate-x-1/2 items-center gap-4 border py-2 pr-2 pl-6 whitespace-nowrap"
            style={{ left: at.x, top: at.y - 40 }}
            data-testid="trail-leader"
            data-leader={leader.marcherId}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <FlagPennantIcon
                size={12}
                weight="fill"
                className="text-accent"
                aria-hidden
            />
            <span className={stored ? undefined : "pr-4"}>
                {tolgee.t("pathways.trail.leader", "Leader · {marcher}", {
                    marcher: leader.drill,
                })}
            </span>
            {stored && (
                <IconButton
                    label={reverseLabel(trail.along)}
                    disabled={trail.along}
                    action="reverseTrail"
                    onClick={() => runAction("reverseTrail")}
                    testId="trail-reverse"
                >
                    <ArrowsLeftRightIcon size={14} />
                </IconButton>
            )}
        </div>
    );
}

/**
 * The group path's name by its line while it's edited (interaction round 2): "Group path · 16",
 * over the line's highest point, so the line reads as the middle the members' lanes follow, not as
 * one more marcher's path. It takes no presses.
 */
function GroupPathLabel({ session }: { session: PathSession }) {
    const view = useFieldViewStore();
    const outline = pathOutline(shapeOf(session));
    if (outline.length === 0) return null;
    const top = outline
        .map((p) => fieldToElement(view, p.x, p.y))
        .reduce((a, b) => (b.y < a.y ? b : a));
    return (
        <div
            className="rounded-6 border-stroke bg-modal text-sub text-text shadow-modal pointer-events-none absolute z-10 -translate-x-1/2 border px-6 py-2 whitespace-nowrap"
            style={{ left: top.x, top: top.y - 32 }}
            data-testid="path-group-label"
        >
            {tolgee.t("pathways.editor.groupLabel", "Group path · {count}", {
                count: session.target.group?.members.length ?? 0,
            })}
        </div>
    );
}

/** While drawing: who it's for and the Line's ways to go on, the keys as keycaps */
function PathPenBanner({ session }: { session: PathSession }) {
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const keys = getActionShortcutKeys("shapeRemoveLastPoint", { overrides });
    const esc = () => <Shortcut action="cancelAlignmentUpdates" />;
    return (
        <div
            className="rounded-6 border-stroke bg-bg-1 bg-modal text-body text-text shadow-modal pointer-events-none absolute top-12 left-1/2 z-10 -translate-x-1/2 border px-12 py-6"
            data-testid="path-pen-banner"
        >
            {/* With the key unbound, only the right-click is said */}
            {session.follow && session.follow.grabbed === null ? (
                <T
                    keyName="pathways.banner.followGrab"
                    defaultValue="Follow: drag a trail out of either end of the line · <esc></esc> to leave"
                    params={{ esc }}
                />
            ) : session.follow && ripplesIn(session.follow) ? (
                <T
                    keyName="pathways.banner.rippleDrawing"
                    defaultValue="Ripple in, {marcher} leading: click an end of the form to go straight in, or click for corners first · Double-click to finish · <esc></esc> to cancel"
                    params={{
                        marcher:
                            session.target.trail?.members.at(-1)?.drill ?? "",
                        esc,
                    }}
                />
            ) : session.target.trail ? (
                <T
                    keyName="pathways.banner.trailDrawing"
                    defaultValue="Trail for {count} marchers, {marcher} leading: click for a corner, drag for a smooth point · Right-click removes the last · Double-click to finish · <esc></esc> to cancel"
                    params={{
                        count: session.target.trail.members.length,
                        marcher:
                            session.target.trail.members.at(-1)?.drill ?? "",
                        esc,
                    }}
                />
            ) : session.target.group &&
              !(
                  session.target.lane &&
                  session.target.group.members.length === 1
              ) ? (
                <T
                    keyName="pathways.banner.groupDrawing"
                    defaultValue="Group path for {count} marchers: click for a corner, drag for a smooth point · Right-click removes the last · Double-click to finish · <esc></esc> to cancel"
                    params={{
                        count: session.target.group.members.length,
                        esc,
                    }}
                />
            ) : keys ? (
                <T
                    keyName="pathways.banner.drawingPoints"
                    defaultValue="{marcher}'s path: click for a corner, drag for a smooth point · Right-click or <keys></keys> removes the last · Double-click to finish · <esc></esc> to cancel"
                    params={{
                        marcher: session.drill,
                        keys: () => <Shortcut action="shapeRemoveLastPoint" />,
                        esc,
                    }}
                />
            ) : (
                <T
                    keyName="pathways.banner.drawingPointsClick"
                    defaultValue="{marcher}'s path: click for a corner, drag for a smooth point · Right-click removes the last · Double-click to finish · <esc></esc> to cancel"
                    params={{ marcher: session.drill, esc }}
                />
            )}
        </div>
    );
}

function PathEditorBar({
    session,
    fieldProperties,
}: {
    session: PathSession;
    fieldProperties: FieldProperties;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({
        width: 0,
        height: 0,
        fw: Infinity,
        fh: Infinity,
    });
    useLayoutEffect(() => {
        const el = ref.current;
        const field = el?.offsetParent;
        if (!el || !field) return;
        const measure = () =>
            setSize({
                width: el.offsetWidth,
                height: el.offsetHeight,
                fw: field.clientWidth,
                fh: field.clientHeight,
            });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        observer.observe(field);
        return () => observer.disconnect();
    }, []);
    // Beside the lines drawn: under them, above when there's no room, as the shape editor sits. A
    // quiet group path draws only its selected marchers' lines, so the bar goes by those
    const view = useFieldViewStore();
    const ownableNow = usePathPenStore((s) => s.ownable);
    const outline: XY[] = useMemo(() => {
        const drawn = drawingOf(session, ownableNow);
        const lines = drawn?.outline ?? drawn?.lanes?.flat() ?? [];
        return lines.length > 0 ? [...lines] : pathOutline(shapeOf(session));
    }, [session, ownableNow]);
    // The Follow tool's line, its end spots and the pointer stay clear too, with room under each
    // for the field's note (the hover note, the step readout), so the bar never covers the work
    const footprint = useMemo(() => followFootprint(session), [session]);
    const place = editorPlacement({
        outline: outline.map((p) => fieldToElement(view, p.x, p.y)),
        handles: footprint.flatMap((p) => {
            const e = fieldToElement(view, p.x, p.y);
            return [e, { x: e.x, y: e.y + FIELD_NOTE_ROOM_PX }];
        }),
        width: size.width,
        height: size.height,
        fieldWidth: size.fw,
        fieldHeight: size.fh,
    });
    const drawing = session.phase === "drawing";
    // Quiet (interaction system rule 4): only Edit path, the member commands and Remove path
    const quiet = session.phase === "closed";
    const big = quiet ? null : bigSteps(session, fieldProperties);
    // Step 6 (TC-7): a trail's turns that fall between counts
    const offCount = quiet
        ? { turns: 0, corners: 0 }
        : offCountTally(trailCornersOf(session));
    const stored = session.target.routeId !== null;
    // The open path's selected point: Corner | Smooth for it, as its menu has (step 2)
    const shape = shapeOf(session);
    const picked = drawing ? -1 : pointOf(shape, session.selected);
    const smooth = picked >= 0 && isSmooth(shape, picked);
    // R-14″: a point at an end of an arc stays a corner, and Smooth says why
    const cornerOnly = picked >= 0 && !smooth && besideArc(shape, picked);
    // Detach and Rejoin for a group path (AP-R9, AP-R10): who they act on comes from the selection
    const selectedMembers = usePathPenStore((s) => s.ownable);
    const ownable = detachIdsOf(selectedMembers, session);
    const rejoin = usePathPenStore((s) => s.rejoin);
    // The "back" slot (interaction system rule 5, one ladder): Rejoin for a detached marcher,
    // Reset adjustment for an adjusted member (the lane picked, or the one selected)
    const resetId = resetTargetOf(session, selectedMembers);
    const groupControls =
        !drawing && (ownable.length > 0 || rejoin !== null || resetId !== null);
    // Rejoin's marchers that were Detached: the copy shown, or the group's detached ones
    const detachedOutside =
        session.target.group?.outside.filter((m) => m.detached).length ?? 0;
    const detachedNote =
        session.target.lane?.detachedFrom != null
            ? tolgee.t("pathways.editor.detachedNote", "Detached")
            : detachedOutside > 0
              ? tolgee.t("pathways.editor.detachedCount", "{count} detached", {
                    count: detachedOutside,
                })
              : null;
    // Re-fit shows only when the ends have moved, as Detach shows only when it can act (decision A)
    const refit = !drawing && refitNeeded(session.target);
    // The lane picked on the open group path (decision C), and any Adjust the app moved
    const laneMember =
        !drawing && session.lane
            ? memberOf(session, session.lane.marcherId)
            : undefined;
    const rehomed =
        !drawing &&
        (session.target.group?.members.some((m) => m.adjust?.rehomed) ?? false);
    // An open path is always a stored one, so the bar always holds a control
    const controls = drawing || stored;
    // While a new path is drawn for two or more marchers: Together (a group path) or Follow (a
    // trail), switched without losing the points placed (pathways step 4)
    const kindChoice =
        drawing &&
        !session.byRoute &&
        !session.follow &&
        (!!session.target.trail ||
            (!!session.target.group && session.target.routeId === null));
    const trail = session.target.trail ?? null;
    return (
        <div
            ref={ref}
            className={clsx(
                EDITOR_BAR,
                "text-sub text-text absolute z-10 gap-6 whitespace-nowrap",
            )}
            style={{ left: place.left, top: place.top }}
            data-testid="path-editor"
            data-phase={session.phase}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {big && (
                <Tip
                    label={
                        big.marcher !== undefined
                            ? tolgee.t(
                                  "pathways.editor.bigStepsTipTrail",
                                  "{marcher} has the farthest to go: {inches} in a step. Each marcher walks its own way along the trail at a steady speed. Lengthen the move, or shorten the trail.",
                                  {
                                      marcher: big.marcher,
                                      inches: big.inches,
                                  },
                              )
                            : big.where === null
                              ? tolgee.t(
                                    "pathways.editor.bigStepsTipPoints",
                                    "{inches} in a step, all along the path. Lengthen the move, or move or take out points to shorten the path.",
                                    { inches: big.inches },
                                )
                              : tolgee.t(
                                    "pathways.editor.bigStepsTipLegs",
                                    "Big steps on {legs}. Every marcher passes each point of the path at the same moment, so only the legs onto and off the path change speed. Lengthen the move, or move points to even out the legs.",
                                    {
                                        legs: big.legs
                                            .map((l) =>
                                                l.drill === null
                                                    ? `${legWords(l)} (${l.steps})`
                                                    : l.where === "adjusted"
                                                      ? `${legWords(l)} (${l.steps})`
                                                      : `${l.drill} ${legWords(l)} (${l.steps})`,
                                            )
                                            .join(", "),
                                    },
                                )
                    }
                >
                    <span
                        className="text-yellow flex items-center gap-4 px-4"
                        data-testid="path-big-steps"
                    >
                        <WarningIcon size={14} weight="bold" aria-hidden />
                        {big.where === null
                            ? tolgee.t(
                                  "pathways.editor.bigStepsShort",
                                  "Big steps · {steps}",
                                  { steps: big.steps },
                              )
                            : tolgee.t(
                                  "pathways.editor.bigStepsLeg",
                                  "Big steps · {steps} {where}",
                                  {
                                      steps: big.steps,
                                      where: legWords(big.worst!),
                                  },
                              )}
                    </span>
                </Tip>
            )}
            {offCount.turns > 0 && <OffCountWarning tally={offCount} />}
            {(big || offCount.turns > 0) && controls && <Divider />}
            {drawing ? (
                <>
                    {kindChoice && (
                        <>
                            <span
                                className="flex items-center gap-2"
                                role="group"
                                aria-label={tolgee.t(
                                    "pathways.editor.pathKind",
                                    "How the marchers take the path",
                                )}
                            >
                                <IconButton
                                    label={tolgee.t(
                                        "pathways.editor.togetherTip",
                                        "Together: the group slides along the path and keeps its shape",
                                    )}
                                    action="pathPen"
                                    pressed={!session.target.trail}
                                    onClick={() => runAction("pathPen")}
                                    testId="path-kind-together"
                                >
                                    <UsersThreeIcon size={14} />
                                    {tolgee.t(
                                        "pathways.editor.together",
                                        "Together",
                                    )}
                                </IconButton>
                                <IconButton
                                    label={tolgee.t(
                                        "pathways.editor.followTip",
                                        "Follow: the line follows its leader along the trail into its end spots",
                                    )}
                                    action="followTrail"
                                    pressed={!!session.target.trail}
                                    onClick={() => runAction("followTrail")}
                                    testId="path-kind-follow"
                                >
                                    <PathIcon size={14} />
                                    {tolgee.t("actions.path.follow", "Follow")}
                                </IconButton>
                            </span>
                            <Divider />
                        </>
                    )}
                    {session.follow && session.follow.grabbed !== null && (
                        <FollowControls session={session} />
                    )}
                    {session.follow && <FollowEndsControls session={session} />}
                    <span className="flex items-center gap-2">
                        <IconButton
                            label={tolgee.t(
                                "pathways.editor.removeLastPoint",
                                "Remove last point",
                            )}
                            action="shapeRemoveLastPoint"
                            disabled={session.points.length === 0}
                            onClick={() => runAction("shapeRemoveLastPoint")}
                            testId="path-remove-last"
                        >
                            <BackspaceIcon size={14} />
                        </IconButton>
                        <IconButton
                            label={tolgee.t("pathways.editor.cancel", "Cancel")}
                            action="cancelAlignmentUpdates"
                            onClick={() => runAction("cancelAlignmentUpdates")}
                            testId="path-cancel"
                        >
                            <XIcon size={14} />
                        </IconButton>
                    </span>
                    <Divider />
                    <EditorButton
                        onClick={() => runAction("applyShape")}
                        testId="path-finish"
                    >
                        {tolgee.t("pathways.editor.finish", "Finish")}
                    </EditorButton>
                </>
            ) : (
                <>
                    {quiet && (
                        <>
                            <IconButton
                                label={tolgee.t(
                                    "pathways.editor.editTip",
                                    "Show this path's points to drag. A click on its line does it too",
                                )}
                                action="editPath"
                                onClick={() => runAction("editPath")}
                                testId="path-edit"
                            >
                                <PencilSimpleIcon size={14} />
                                {tolgee.t("actions.path.edit", "Edit path")}
                            </IconButton>
                            <Divider />
                        </>
                    )}
                    {picked >= 0 && (
                        <>
                            <span
                                className="flex items-center gap-2"
                                role="group"
                                aria-label={tolgee.t(
                                    "pathways.editor.pointType",
                                    "Point type",
                                )}
                            >
                                <IconButton
                                    label={tolgee.t(
                                        "actions.path.pointCorner",
                                        "Corner point",
                                    )}
                                    action="pathPointCorner"
                                    pressed={!smooth}
                                    onClick={() => runAction("pathPointCorner")}
                                    testId="path-point-corner"
                                >
                                    <LineSegmentsIcon size={14} />
                                </IconButton>
                                <IconButton
                                    label={
                                        cornerOnly
                                            ? besideArcReason()
                                            : tolgee.t(
                                                  "actions.path.pointSmooth",
                                                  "Smooth point",
                                              )
                                    }
                                    action="pathPointSmooth"
                                    disabled={cornerOnly}
                                    pressed={smooth}
                                    onClick={() => runAction("pathPointSmooth")}
                                    testId="path-point-smooth"
                                >
                                    <WaveSineIcon size={14} />
                                </IconButton>
                            </span>
                            {stored && <Divider />}
                        </>
                    )}
                    {laneMember && (
                        <>
                            <span
                                className="flex items-center gap-2 px-4"
                                data-testid="path-lane-picked"
                            >
                                {tolgee.t(
                                    "pathways.editor.laneOf",
                                    "Spot {spot} · {marcher}",
                                    {
                                        spot: (laneMember.slot ?? 0) + 1,
                                        marcher: laneMember.drill,
                                    },
                                )}
                                {session.lane?.key !== null && (
                                    <IconButton
                                        label={tolgee.t(
                                            "actions.path.adjustRemoveKey",
                                            "Remove adjustment point",
                                        )}
                                        action="adjustRemoveKey"
                                        onClick={() =>
                                            runAction("adjustRemoveKey")
                                        }
                                        testId="path-adjust-remove-key"
                                    >
                                        <BackspaceIcon size={14} />
                                    </IconButton>
                                )}
                            </span>
                            <Divider />
                        </>
                    )}
                    {groupControls && (
                        <>
                            <span className="flex items-center gap-2">
                                {ownable.length > 0 && (
                                    <IconButton
                                        label={tolgee.t(
                                            "pathways.editor.detachTip",
                                            "Give the selected marchers, or the marcher whose lane is picked, their own copy of the group path. They walk in step with the group until you edit the copy",
                                        )}
                                        action="detachPath"
                                        onClick={() => runAction("detachPath")}
                                        testId="path-detach"
                                    >
                                        <ArrowsSplitIcon size={14} />
                                        {ownable.length > 1
                                            ? tolgee.t(
                                                  "pathways.editor.detachCount",
                                                  "Detach {count}",
                                                  { count: ownable.length },
                                              )
                                            : tolgee.t(
                                                  "actions.path.detach",
                                                  "Detach",
                                              )}
                                    </IconButton>
                                )}
                                {rejoin !== null && detachedNote && (
                                    // Says in words what the Detached ring's tooltip says, so a
                                    // finger reads it too (review of #900, N3)
                                    <span
                                        className="text-text-subtitle px-4"
                                        data-testid="path-detached-note"
                                    >
                                        {detachedNote}
                                    </span>
                                )}
                                {rejoin !== null && (
                                    <IconButton
                                        label={tolgee.t(
                                            "pathways.editor.rejoinTip",
                                            "Put the selected marchers back on the group path. A detached marcher's copy goes, and so does any adjustment on it",
                                        )}
                                        action="rejoinPath"
                                        onClick={() => runAction("rejoinPath")}
                                        testId="path-rejoin"
                                    >
                                        <ArrowsMergeIcon size={14} />
                                        {tolgee.t(
                                            "actions.path.rejoin",
                                            "Rejoin",
                                        )}
                                    </IconButton>
                                )}
                                {rejoin === null && resetId !== null && (
                                    <IconButton
                                        label={tolgee.t(
                                            "pathways.editor.resetTip",
                                            "Take off this marcher's adjustment, so it walks its plain lane of the group path again",
                                        )}
                                        action="adjustResetSpot"
                                        onClick={() =>
                                            runAction("adjustResetSpot")
                                        }
                                        testId="path-adjust-reset"
                                    >
                                        <ArrowCounterClockwiseIcon size={14} />
                                        {tolgee.t(
                                            "actions.path.adjustResetSpot",
                                            "Reset adjustment",
                                        )}
                                    </IconButton>
                                )}
                            </span>
                            {stored && <Divider />}
                        </>
                    )}
                    {rehomed && (
                        <>
                            <Tip
                                label={tolgee.t(
                                    "pathways.editor.rehomedTip",
                                    "A point an adjustment was attached to changed, so the adjustment moved to the nearest points left. Check it still does what you meant.",
                                )}
                            >
                                <button
                                    type="button"
                                    className="text-yellow flex items-center gap-4 px-4"
                                    onClick={() =>
                                        runAction("adjustAcknowledge")
                                    }
                                    data-testid="path-rehomed-badge"
                                >
                                    <WarningIcon
                                        size={14}
                                        weight="bold"
                                        aria-hidden
                                    />
                                    {tolgee.t(
                                        "pathways.editor.rehomedBadge",
                                        "Adjustment re-homed",
                                    )}
                                </button>
                            </Tip>
                            <Divider />
                        </>
                    )}
                    {refit && (
                        <>
                            <IconButton
                                label={tolgee.t(
                                    "pathways.editor.refitTip",
                                    "Move this path's ends to where its marchers stand now and stretch its corners to match",
                                )}
                                action="refitPath"
                                onClick={() => runAction("refitPath")}
                                testId="path-refit"
                            >
                                <ArrowsOutLineHorizontalIcon size={14} />
                                {tolgee.t("actions.path.refit", "Re-fit path")}
                            </IconButton>
                            <Divider />
                        </>
                    )}
                    {stored && trail && (
                        <>
                            <IconButton
                                label={reverseLabel(trail.along)}
                                disabled={trail.along}
                                action="reverseTrail"
                                onClick={() => runAction("reverseTrail")}
                                testId="path-reverse"
                            >
                                <ArrowsLeftRightIcon size={14} />
                                {tolgee.t(
                                    "actions.path.reverse",
                                    "Reverse leader",
                                )}
                            </IconButton>
                            <Divider />
                        </>
                    )}
                    {stored && (
                        <IconButton
                            label={
                                trail
                                    ? tolgee.t(
                                          "actions.path.removeTrail",
                                          "Remove trail",
                                      )
                                    : tolgee.t(
                                          "actions.path.remove",
                                          "Remove path",
                                      )
                            }
                            action="removePath"
                            onClick={() => runAction("removePath")}
                            testId="path-remove"
                        >
                            <TrashIcon size={14} />
                        </IconButton>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * The Follow tool's Ends on the path bar (DL-8, AP-T9, RP-1), when the line already has end spots
 * here: From trail, Keep end spots, or Ripple in (disabled with the reason when those spots don't
 * stand in a form). Shown before an end is grabbed too, so the choice comes first (step 9).
 */
function FollowEndsControls({ session }: { session: PathSession }) {
    const follow = session.follow!;
    const fromTrail = follow.ends === "trail";
    const ripple = ripplesIn(follow);
    // A finger gets no tooltip: a press on the greyed-out choice says why (step 9 review)
    const sayWhy = (why: string) => () =>
        toast.info(why, { id: "follow-ends-why" });
    const needSpots = tolgee.t(
        "pathways.editor.endsNeedSpots",
        "Ripple in and Keep end spots follow into end spots the line already has on this page. Place them first (a shape tool, or move the marchers), then choose Follow",
    );
    if (!follow.keep)
        // No end spots here: Ripple in shows greyed out, saying what would make it work
        return (
            <>
                <IconButton
                    label={needSpots}
                    action="followEndsRipple"
                    disabled
                    onClick={() => undefined}
                    onDisabledClick={sayWhy(needSpots)}
                    testId="follow-ends-ripple"
                >
                    {tolgee.t("pathways.editor.endsRipple", "Ripple in")}
                </IconButton>
                <Divider />
            </>
        );
    const rippleWhy =
        follow.formWhy ??
        tolgee.t(
            "pathways.editor.endsRippleOff",
            "Ripple in: their end spots don't stand in a line, curve or arc",
        );
    return (
        <>
            <span
                className="flex items-center gap-2"
                role="group"
                aria-label={tolgee.t("pathways.editor.ends", "Ends")}
                data-testid="follow-ends"
            >
                <IconButton
                    label={tolgee.t(
                        "pathways.editor.endsFromTrailTip",
                        "From trail: the line stops along the trail, and those become its end spots",
                    )}
                    action="followEndsTrail"
                    pressed={fromTrail}
                    onClick={() => runAction("followEndsTrail")}
                    testId="follow-ends-trail"
                >
                    {tolgee.t("pathways.editor.endsFromTrail", "From trail")}
                </IconButton>
                <IconButton
                    label={tolgee.t(
                        "pathways.editor.endsKeepTip",
                        "Keep end spots: the line follows the trail into the end spots it already has",
                    )}
                    action="followEndsKeep"
                    pressed={follow.ends === "keep"}
                    onClick={() => runAction("followEndsKeep")}
                    testId="follow-ends-keep"
                >
                    {tolgee.t("pathways.editor.endsKeep", "Keep end spots")}
                </IconButton>
                <IconButton
                    label={
                        follow.form
                            ? tolgee.t(
                                  "pathways.editor.endsRippleTip",
                                  "Ripple in: the line follows its leader straight to the near end of the form its end spots make, then along it. The leader takes the far end",
                              )
                            : rippleWhy
                    }
                    action="followEndsRipple"
                    disabled={!follow.form}
                    pressed={ripple}
                    onClick={() => runAction("followEndsRipple")}
                    onDisabledClick={sayWhy(rippleWhy)}
                    testId="follow-ends-ripple"
                >
                    {tolgee.t("pathways.editor.endsRipple", "Ripple in")}
                </IconButton>
            </span>
            <Divider />
        </>
    );
}

/** A count to the nearest half, as a drill book writes it: 6, 6½ */
function countText(count: number): string {
    const whole = Math.floor(count);
    return count - whole >= 0.5 ? `${whole === 0 ? "" : whole}½` : `${whole}`;
}

/**
 * The Follow tool's choices on the path bar (pathways step 4b): Spacing, Keep spacing or Even N
 * steps, Even held to the largest N that keeps everyone walking forward (DL-7, AP-T8); ▶ Preview,
 * the line looping its walk (step 4c, DL-17); and, when the line already has end spots here, Ends:
 * From trail or Keep end spots (DL-8, AP-T9).
 */
function FollowControls({ session }: { session: PathSession }) {
    const follow = session.follow!;
    const plan = followPlanOf(session);
    const limit = evenLimitOf(plan);
    // The spacing in use: Even held to its limit, Keep spacing while the limit is under one step
    const spacing = followSpacingOf(session);
    const even = spacing.kind === "even" ? spacing.steps : null;
    const evenOff = limit !== null && limit < EVEN_STEP;
    const fromTrail = follow.ends === "trail";
    const ripple = ripplesIn(follow);
    // ▶ Preview (step 4c, DL-17): once there's a walk to show; Ripple in has one once grabbed
    const canPreview =
        (ripple || session.points.length > 0) &&
        followMarchersOf(session) !== null;
    // RP-5: the count the leader reaches the next form on
    const ripplePlan = ripple ? rippleDrawnPlanOf(session) : null;
    const arrival = ripplePlan
        ? rippleArrivalCount(
              ripplePlan,
              session.target.end - session.target.start,
          )
        : null;
    const reducedMotion = prefersReducedMotion();
    const setEven = (steps: number) =>
        setFollowSpacing({
            kind: "even",
            steps: Math.max(
                EVEN_STEP,
                limit === null ? steps : Math.min(steps, limit),
            ),
        });
    return (
        <>
            {fromTrail && (
                <>
                    <span
                        className="flex items-center gap-2"
                        role="group"
                        aria-label={tolgee.t(
                            "pathways.editor.spacing",
                            "Spacing",
                        )}
                        data-testid="follow-spacing"
                    >
                        <IconButton
                            label={tolgee.t(
                                "pathways.editor.keepSpacingTip",
                                "Keep spacing: each marcher keeps its distance to the next along the way",
                            )}
                            pressed={even === null}
                            onClick={() => setFollowSpacing({ kind: "keep" })}
                            testId="follow-keep-spacing"
                        >
                            {tolgee.t(
                                "pathways.editor.keepSpacing",
                                "Keep spacing",
                            )}
                        </IconButton>
                        <IconButton
                            label={
                                evenOff
                                    ? tolgee.t(
                                          "pathways.editor.evenOff",
                                          "Even: the trail is too short for even steps, or someone would walk backward. Draw it longer",
                                      )
                                    : tolgee.t(
                                          "pathways.editor.evenTip",
                                          "Even: every marcher ends the same number of steps from the next",
                                      )
                            }
                            disabled={evenOff}
                            pressed={even !== null}
                            onClick={() =>
                                setEven(
                                    even ??
                                        Math.min(
                                            EVEN_FIRST,
                                            limit ?? EVEN_FIRST,
                                        ),
                                )
                            }
                            testId="follow-even"
                        >
                            {tolgee.t("pathways.editor.even", "Even")}
                        </IconButton>
                        {even !== null && (
                            <>
                                <IconButton
                                    label={tolgee.t(
                                        "pathways.editor.evenCloser",
                                        "Closer together",
                                    )}
                                    disabled={even <= EVEN_STEP}
                                    onClick={() => setEven(even - EVEN_STEP)}
                                    testId="follow-even-less"
                                >
                                    −
                                </IconButton>
                                <span data-testid="follow-even-steps">
                                    {tolgee.t(
                                        "pathways.editor.evenSteps",
                                        "{steps} steps",
                                        { steps: even },
                                    )}
                                </span>
                                <IconButton
                                    label={tolgee.t(
                                        "pathways.editor.evenFarther",
                                        "Farther apart",
                                    )}
                                    disabled={
                                        limit !== null &&
                                        even + EVEN_STEP > limit
                                    }
                                    onClick={() => setEven(even + EVEN_STEP)}
                                    testId="follow-even-more"
                                >
                                    +
                                </IconButton>
                                {limit !== null && (
                                    <span
                                        className="text-text-subtitle"
                                        data-testid="follow-even-limit"
                                    >
                                        {tolgee.t(
                                            "pathways.editor.evenLimit",
                                            "up to {limit}",
                                            { limit },
                                        )}
                                    </span>
                                )}
                            </>
                        )}
                    </span>
                    <Divider />
                </>
            )}
            {ripple && arrival !== null && (
                <>
                    <span
                        className="text-text-subtitle"
                        data-testid="follow-ripple-arrival"
                    >
                        {arrival === 0
                            ? tolgee.t(
                                  "pathways.editor.rippleArrivalStart",
                                  "Leader starts at the form",
                              )
                            : tolgee.t(
                                  "pathways.editor.rippleArrival",
                                  "Leader reaches the form on count {count}",
                                  { count: countText(arrival) },
                              )}
                    </span>
                    <Divider />
                </>
            )}
            {(fromTrail || ripple) && (
                <>
                    <IconButton
                        label={
                            reducedMotion
                                ? tolgee.t(
                                      "pathways.editor.previewReduced",
                                      "Preview is off while your system asks for less motion",
                                  )
                                : canPreview
                                  ? tolgee.t(
                                        "pathways.editor.previewTip",
                                        "Preview: the marchers walk the trail from start to end, again and again",
                                    )
                                  : tolgee.t(
                                        "pathways.editor.previewNothing",
                                        "Preview: place a point first",
                                    )
                        }
                        action="followPreview"
                        disabled={!canPreview || reducedMotion}
                        pressed={!!follow.preview && !reducedMotion}
                        onClick={() => runAction("followPreview")}
                        testId="follow-preview"
                    >
                        <PlayIcon size={14} />
                        {tolgee.t("pathways.editor.preview", "Preview")}
                    </IconButton>
                    <Divider />
                </>
            )}
        </>
    );
}
