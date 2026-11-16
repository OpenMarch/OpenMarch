import { useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { T } from "@tolgee/react";
import {
    ArrowCounterClockwiseIcon,
    ArrowsLeftRightIcon,
    ArrowsMergeIcon,
    ArrowsOutLineHorizontalIcon,
    ArrowsSplitIcon,
    BackspaceIcon,
    BezierCurveIcon,
    DotsThreeIcon,
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
import { fieldToElement, useFieldViewStore } from "@/field/three/fieldView";
import { stackedPlacement } from "@/shapes/editor/editorPlacement";
import { useShapeEditorRect } from "@/shapes/editor/shapeEditorRect";
import {
    KEEP_MENU_EVENTS,
    MenuItemWithReason,
} from "@/components/timeline/TimelineRangeMenu";
import {
    MENU_CONTENT_CLASS,
    MENU_ITEM_CLASS,
    MENU_SEPARATOR_CLASS,
} from "@/components/ui/popupClasses";
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
    rippleDrawnPlanOf,
    ripplesIn,
    setFollowSpacing,
} from "./followDrag";
import { rippleArrivalCount } from "@/db-functions/timelineTrailRipplePlan";
import {
    detachAllIdsOf,
    detachAllLabel,
    detachAllNote,
    detachIdsOf,
    isLoose,
    detachLabel,
    detachNote,
    editGroupPathLabel,
    editLineLabel,
    laneFocusOf,
    pathSlotsOf,
    memberOf,
    groupViewOf,
    shapeOf,
    usePathPenStore,
    type PathSession,
} from "./pathPenStore";
import { drawingOf } from "./pathPenMode";
import {
    besideArc,
    besideArcReason,
    isSmooth,
    pathOutline,
    pointOf,
} from "./pathEdit";

// Big steps lives with the inspector's line, which mustn't load the field mode (pathways round 2)
export { bigSteps, trailDistances, type BigSteps } from "./pathBigSteps";

/** Under a marcher: the field's note there (offset and pill), which the path bar leaves room for */
const FIELD_NOTE_ROOM_PX = 40;
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
    const ownable = usePathPenStore((s) => s.ownable);
    const shapeToolOpen = useShapeToolStore((s) => s.tool !== null);
    if (!session) return null;
    // Edit group path, or the whole group selected (round 4): its line is named, so it reads as
    // the line the whole group follows, not as one more marcher's path
    const view = groupViewOf(session, ownable);
    const groupLabel =
        view === "edit" || (view === "whole" && !hidden) ? (
            <GroupPathLabel session={session} />
        ) : null;
    // A quiet path (closed, interaction system rule 4) has the compact bar: Edit path, the member
    // commands and Remove path, so they're found without its menu. A trail keeps its leader's
    // mark, which says who leads and turns the line around (step 4). Not drawn, nothing shows
    if (session.phase === "closed")
        return hidden || shapeToolOpen ? null : (
            <RichTips>
                {groupLabel}
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
            {isLoose(session)
                ? // A loose path's marchers each have their own copy (round 7): no group path
                  tolgee.t("pathways.editor.looseLabel", "Path · {count}", {
                      count: session.target.group?.members.length ?? 0,
                  })
                : tolgee.t(
                      "pathways.editor.groupLabel",
                      "Group path · {count}",
                      {
                          count: session.target.group?.members.length ?? 0,
                      },
                  )}
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
    // quiet group path draws only its selected marchers' lines, so the bar goes by those; the
    // group line alone (the whole group selected, or edited) doesn't reach its marchers' starts
    // and end spots, so those count too, and the bar stays put from one to the other (round 4)
    const view = useFieldViewStore();
    const ownableNow = usePathPenStore((s) => s.ownable);
    const outline: XY[] = useMemo(() => {
        const drawn = drawingOf(session, ownableNow);
        const lines = drawn?.outline
            ? [
                  ...drawn.outline,
                  ...(drawn.lanes?.flat() ?? []),
                  ...(session.target.group && !session.target.trail
                      ? [...(drawn.rings ?? []), ...drawn.spots]
                      : []),
              ]
            : (drawn?.lanes?.flat() ?? []);
        return lines.length > 0 ? lines : pathOutline(shapeOf(session));
    }, [session, ownableNow]);
    // A selected placed shape's bar is on the field too: the path bar stacks clear of it
    const shapeBar = useShapeEditorRect((s) => s.rect);
    // The Follow tool's line, its end spots and the pointer stay clear too, with room under each
    // for the field's note (the hover note, the step readout), so the bar never covers the work
    const footprint = useMemo(() => followFootprint(session), [session]);
    const place = stackedPlacement(
        {
            outline: outline.map((p) => fieldToElement(view, p.x, p.y)),
            handles: footprint.flatMap((p) => {
                const e = fieldToElement(view, p.x, p.y);
                return [e, { x: e.x, y: e.y + FIELD_NOTE_ROOM_PX }];
            }),
            width: size.width,
            height: size.height,
            fieldWidth: size.fw,
            fieldHeight: size.fh,
        },
        shapeBar,
    );
    const drawing = session.phase === "drawing";
    const quiet = session.phase === "closed";
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
            {offCount.turns > 0 && <OffCountWarning tally={offCount} />}
            {offCount.turns > 0 && controls && <Divider />}
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
                    <PathSlots session={session} />
                    {picked >= 0 && (
                        <>
                            <Divider />
                            <PointTypeButtons
                                smooth={smooth}
                                cornerOnly={cornerOnly}
                            />
                        </>
                    )}
                    {laneMember && (
                        <>
                            <Divider />
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
                                            "Remove bend point",
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
                        </>
                    )}
                    {rehomed && (
                        <>
                            <Divider />
                            <Tip
                                label={tolgee.t(
                                    "pathways.editor.rehomedTip",
                                    "A point a bend was attached to changed, so the bend moved to the nearest points left. Check it still does what you meant.",
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
                                        "Bend moved",
                                    )}
                                </button>
                            </Tip>
                        </>
                    )}
                    {stored && trail && (
                        <>
                            <Divider />
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
                        </>
                    )}
                    {stored && (
                        <>
                            <Divider />
                            <PathMoreMenu session={session} />
                        </>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * The path bar's fixed slots (interaction round 2): Edit group path (Edit path for a path of one) ·
 * Edit <name>'s line · Match group or Rejoin (round 6: Detach moved to ···, like a design tool's
 * Detach instance), in the same places for every marcher, so a press after the selection changes
 * lands on what it did before. A slot that can't act stays, greyed out, its tooltip saying why (a press on
 * it says so too, for a finger). A trail has only Edit path: its members have no lanes.
 */
function PathSlots({ session }: { session: PathSession }) {
    const ownable = usePathPenStore((s) => s.ownable);
    const rejoin = usePathPenStore((s) => s.rejoin);
    const slots = pathSlotsOf(session, ownable, rejoin);
    const editing = session.phase === "open" && !session.lane;
    const lineId = laneFocusOf(session);
    const sayWhy = (why: string | null) => () => {
        if (why !== null) toast.info(why, { id: "path-slot-why" });
    };
    const lineReason = "reason" in slots.line ? slots.line.reason : null;
    const lineDrill = "drill" in slots.line ? slots.line.drill : null;
    // On a group path, Edit path edits the line every member follows: named so (round 3). A
    // loose path (round 7) is the marchers' own paths edited together: Edit path
    const group =
        !!session.target.group && !session.target.lane && !isLoose(session);
    return (
        <>
            <IconButton
                label={
                    group
                        ? tolgee.t(
                              "pathways.editor.editGroupTip",
                              "Show the group path's points to drag. Every marcher on it follows",
                          )
                        : tolgee.t(
                              "pathways.editor.editTip",
                              "Show this path's points to drag. A click on its line does it too",
                          )
                }
                action="editPath"
                pressed={editing}
                onClick={() => runAction("editPath")}
                testId="path-edit"
                className={EDIT_SLOT_WIDTH}
            >
                <PencilSimpleIcon size={14} />
                {group
                    ? editGroupPathLabel()
                    : tolgee.t("actions.path.edit", "Edit path")}
            </IconButton>
            {slots.shown && (
                <>
                    <Divider />
                    <IconButton
                        label={
                            lineReason ??
                            tolgee.t(
                                "pathways.editor.editLineTip",
                                "Bend only {marcher}'s line, by its handles. It keeps following the group path's edits. A click on the line does it too",
                                { marcher: lineDrill ?? "" },
                            )
                        }
                        action="editLine"
                        disabled={lineReason !== null}
                        pressed={lineId !== null}
                        onClick={() => runAction("editLine")}
                        onDisabledClick={sayWhy(lineReason)}
                        testId="path-edit-line"
                        className={LINE_SLOT_WIDTH}
                    >
                        <BezierCurveIcon size={14} />
                        {editLineLabel(lineDrill)}
                    </IconButton>
                    {/* Back to the group (round 6): Rejoin for detached marchers, else Match group.
                        A loose path has no group to go back to: the slot holds its place (round 7) */}
                    {slots.loose ? (
                        <span
                            aria-hidden
                            className={clsx("inline-flex", SLOT_WIDTH)}
                            data-testid="path-slot-empty"
                        />
                    ) : slots.backIsRejoin ? (
                        <IconButton
                            label={tolgee.t(
                                "pathways.editor.rejoinTip",
                                "Put the selected marchers back on the group path. A detached marcher's copy goes, and so do any bends on its line",
                            )}
                            action="rejoinPath"
                            onClick={() => runAction("rejoinPath")}
                            testId="path-rejoin"
                            className={SLOT_WIDTH}
                        >
                            <ArrowsMergeIcon size={14} />
                            {rejoin!.marcherIds.length > 1
                                ? tolgee.t(
                                      "pathways.editor.rejoinCount",
                                      "Rejoin {count}",
                                      { count: rejoin!.marcherIds.length },
                                  )
                                : tolgee.t("actions.path.rejoin", "Rejoin")}
                        </IconButton>
                    ) : (
                        <IconButton
                            label={
                                slots.matchReason ??
                                tolgee.t(
                                    "pathways.editor.resetTip",
                                    "Take this marcher's bends off, so it walks the group path like the others again",
                                )
                            }
                            action="adjustResetSpot"
                            disabled={slots.matchReason !== null}
                            onClick={() => runAction("adjustResetSpot")}
                            onDisabledClick={sayWhy(slots.matchReason)}
                            testId="path-adjust-reset"
                            className={SLOT_WIDTH}
                        >
                            <ArrowCounterClockwiseIcon size={14} />
                            {tolgee.t(
                                "actions.path.adjustResetSpot",
                                "Match group",
                            )}
                        </IconButton>
                    )}
                </>
            )}
        </>
    );
}

/**
 * The first slot fits "Edit group path", so the bar keeps its width (and place) when it says
 * "Edit path" instead (round 8)
 */
const EDIT_SLOT_WIDTH = "min-w-[116px] justify-start";

/** Edit <name>'s line's slot fits a long drill number, so the slots after it never move */
const LINE_SLOT_WIDTH = "min-w-[124px] justify-start";

/** The third slot holds Match group or Rejoin 12 at one width, so ··· never moves */
const SLOT_WIDTH = "min-w-[104px] justify-start";

/** The open path's selected point: Corner | Smooth, as its menu has (step 2) */
function PointTypeButtons({
    smooth,
    cornerOnly,
}: {
    smooth: boolean;
    cornerOnly: boolean;
}) {
    return (
        <span
            className="flex items-center gap-2"
            role="group"
            aria-label={tolgee.t("pathways.editor.pointType", "Point type")}
        >
            <IconButton
                label={tolgee.t("actions.path.pointCorner", "Corner point")}
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
                        : tolgee.t("actions.path.pointSmooth", "Smooth point")
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
    );
}

/**
 * The bar's ··· (interaction round 2): what's rarer, kept off the bar so the slots stay few and
 * still: Rejoin when Match group holds its slot (a mixed selection), Re-center group path (Re-fit),
 * then after a line Detach from group path (some of the group selected, round 6: it left the bar),
 * Detach all (the whole group) and Remove path. The same commands, in the same order, as the Path
 * menus, Re-fit greyed out with the reason where it can't act.
 */
function PathMoreMenu({ session }: { session: PathSession }) {
    const ownable = usePathPenStore((s) => s.ownable);
    const rejoin = usePathPenStore((s) => s.rejoin);
    const [open, setOpen] = useState(false);
    const trail = !!session.target.trail;
    const loose = isLoose(session);
    const group = !!session.target.group && !session.target.lane && !loose;
    const rejoinHere =
        rejoin !== null && detachIdsOf(ownable, session).length > 0;
    const detachAll = detachAllIdsOf(ownable, session);
    // Detach (round 6): only while it can act; the whole group selected gets Detach all instead
    const detachIds =
        detachAll.length === 0 && session.phase !== "drawing"
            ? detachIdsOf(ownable, session)
            : [];
    const refitReason = refitNeeded(session.target)
        ? null
        : group
          ? tolgee.t(
                "pathways.slots.centered",
                "The group path already runs through the middle of its marchers",
            )
          : loose
            ? tolgee.t(
                  "pathways.slots.centeredLoose",
                  "The path already runs through the middle of these marchers",
              )
            : tolgee.t(
                  "pathways.slots.fits",
                  "The path already fits where its marcher stands",
              );
    const more = tolgee.t("pathways.editor.more", "More path commands");
    return (
        <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
            <Tip label={more}>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        aria-label={more}
                        className={clsx(
                            "rounded-4 flex min-h-24 min-w-24 items-center justify-center p-4",
                            open
                                ? "bg-accent/15 text-accent"
                                : "hover:text-accent",
                        )}
                        data-testid="path-more"
                    >
                        <DotsThreeIcon size={16} weight="bold" />
                    </button>
                </DropdownMenu.Trigger>
            </Tip>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="end"
                    side="bottom"
                    sideOffset={6}
                    collisionPadding={8}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    {...KEEP_MENU_EVENTS}
                    className={MENU_CONTENT_CLASS}
                    data-testid="path-more-menu"
                >
                    {rejoinHere && (
                        <DropdownMenu.Item
                            className={MENU_ITEM_CLASS}
                            onSelect={() => runAction("rejoinPath")}
                            data-testid="path-more-rejoin"
                        >
                            <ArrowsMergeIcon size={14} aria-hidden />
                            {tolgee.t(
                                "actions.path.rejoinGroup",
                                "Rejoin group path",
                            )}
                        </DropdownMenu.Item>
                    )}
                    {!trail && (
                        <MenuItemWithReason
                            testId="path-refit"
                            reason={refitReason}
                            reasonTestId="path-refit-reason"
                            onSelect={() => runAction("refitPath")}
                        >
                            <ArrowsOutLineHorizontalIcon
                                size={14}
                                aria-hidden
                            />
                            {group
                                ? tolgee.t(
                                      "actions.path.recenter",
                                      "Re-center group path",
                                  )
                                : loose
                                  ? tolgee.t(
                                        "actions.path.recenterLoose",
                                        "Re-center path",
                                    )
                                  : tolgee.t(
                                        "actions.path.refit",
                                        "Re-fit path",
                                    )}
                        </MenuItemWithReason>
                    )}
                    {(rejoinHere || !trail) && (
                        <DropdownMenu.Separator
                            className={MENU_SEPARATOR_CLASS}
                        />
                    )}
                    {detachIds.length > 0 && (
                        // Off the bar (round 6), as a design tool keeps Detach instance in a menu:
                        // Edit <name>'s line is how a member's line is changed and kept following
                        <DropdownMenu.Item
                            className={clsx(MENU_ITEM_CLASS, "items-start")}
                            onSelect={() => runAction("detachPath")}
                            data-testid="path-more-detach"
                        >
                            <ArrowsSplitIcon
                                size={14}
                                aria-hidden
                                className="mt-2 shrink-0"
                            />
                            <span className="flex flex-col">
                                {detachLabel(detachIds.length)}
                                <span className="text-sub text-text-subtitle">
                                    {detachNote()}
                                </span>
                            </span>
                        </DropdownMenu.Item>
                    )}
                    {detachAll.length > 0 && (
                        // Ends the group path (round 5): kept apart from the routine commands,
                        // beside Remove path, saying what it does
                        <DropdownMenu.Item
                            className={clsx(MENU_ITEM_CLASS, "items-start")}
                            onSelect={() => runAction("detachAllPath")}
                            data-testid="path-detach-all"
                        >
                            <ArrowsSplitIcon
                                size={14}
                                aria-hidden
                                className="mt-2 shrink-0"
                            />
                            <span className="flex flex-col">
                                {detachAllLabel(detachAll.length)}
                                <span className="text-sub text-text-subtitle">
                                    {detachAllNote()}
                                </span>
                            </span>
                        </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item
                        className={clsx(
                            MENU_ITEM_CLASS,
                            "data-[highlighted]:text-red",
                        )}
                        onSelect={() => runAction("removePath")}
                        data-testid="path-remove"
                    >
                        <TrashIcon size={14} aria-hidden />
                        {trail
                            ? tolgee.t(
                                  "actions.path.removeTrail",
                                  "Remove trail",
                              )
                            : tolgee.t("actions.path.remove", "Remove path")}
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
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
