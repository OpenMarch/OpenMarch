import type {
    FieldCursor,
    FieldModePress,
    FieldMode,
    FieldModeDrawing,
    FieldModeHover,
    FieldPointer,
} from "@/field/editor/fieldEditor";
import { CLICK_SLOP } from "@/field/editor/fieldEditor";
import {
    placeAdjustKey,
    pruneZeroKeys,
    type AdjustProfile,
    type GroupMemberWalk,
} from "@openmarch/core";
import { landPoint } from "@/shapes/line/lineGeometry";
import { toast } from "sonner";
import { rolesOf, type Roles } from "@/input/modifierRoles";
import type { HonoredRoles } from "@/input/gestureChipStore";
import { currentShapeField } from "@/shapes/field/shapeField";
import { openHandleMenu } from "@/shapes/field/handleMenu";
import {
    asCursor,
    drillTerms,
    handleDrawing,
} from "@/shapes/field/fieldModeBase";
import { holdGesture, type HeldGesture } from "@/shapes/field/heldGesture";
import { edgeGuides } from "@/shapes/frame/edgeGuides";
import { lineCoordinate } from "@/shapes/field/lineCoordinate";
import { toolEnvFor } from "@/shapes/tool/toolEnv";
import type { ToolEnv } from "@/shapes/tool/toolKind";
import type { XY } from "@/shapes/types";
import { drawnAsGroup, type PathTarget } from "./pathTarget";
import {
    followEnds,
    followHit,
    followDrawnPlanOf,
    followHasTrail,
    followMarchersOf,
    grabEnd,
    setFollowHover,
    intoEndSpots,
    lineOf,
    rippleDrawnPlanOf,
    rippleEndAt,
    ripplesIn,
    trailLine,
    type FollowDrag,
} from "./followDrag";
import tolgee from "@/global/singletons/Tolgee";
import {
    PATH_MENU,
    adjustHandlesOf,
    adjustKey,
    laneBendSpotsOf,
    adjustKeyOf,
    laneHitOf,
    laneKey,
    lanePlain,
    splitLeg,
    limitDrag,
    laneOutline,
    memberWalkOf,
    scheduleOf,
    clickPathHandle,
    dragNewPoint,
    dragPathHandle,
    landCorner,
    legOf,
    bulgeLegOf,
    sameShape,
    onLine,
    lineDistance,
    onPath,
    pathHandleAt,
    pathHandles,
    pathHonors,
    pathOutline,
    pathPoints,
    pointOf,
    samePoints,
    tangentHandle,
    tangentOf,
    type PathPoint,
    type PathShape,
} from "./pathEdit";
import {
    addPoint,
    cancelDrag,
    commitAdjustKey,
    commitLaneAdjust,
    commitPoints,
    commitShape,
    deleteAdjustKey,
    memberNow,
    memberOf,
    resetSpot,
    selectLane,
    setHoverLane,
    setLaneEdit,
    deletePoint,
    activatePath,
    focusPath,
    objectsDrawn,
    pathKey,
    pointsOf,
    selectWalkers,
    toggleWalker,
    walkersOf,
    dragPoints,
    endNewPoint,
    finishDrawing,
    removeLastPoint,
    selectPoint,
    setPointSmooth,
    setPointer,
    shapeNewPoint,
    shapeOf,
    pathShown,
    groupViewOf,
    laneFocusOf,
    usePathPenStore,
    type PathObject,
    type PathSession,
} from "./pathPenStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";

/** The env for the roles held, as the shape tool's (half steps, the field's lines, the Snap toggle) */
const envOf = (roles?: Roles): ToolEnv | null => {
    const field = currentShapeField();
    return field ? toolEnvFor(field, roles) : null;
};

/** What a drag on the path reads, for the held-roles chip, as a shape drag names it */
const honored = (shape: PathShape, key: string | null): HonoredRoles => ({
    context: "shape",
    fine: "fine",
    ...(key === null ? {} : pathHonors(shape, key)),
    snaps: true,
});

/** The handle-menu `kind` the path's menus go through, as a shape's do */
const MENU_KIND = { menu: PATH_MENU };

/**
 * The Path group (interaction system, rule 4): what the field's menu offers on a path's line, and
 * on a marcher with a path (`FieldContextMenu`), in the path bar's order (round 2): Edit (group)
 * path, Edit <name>'s line, Detach or Rejoin, Match group (the bar's fixed slots, greyed out where
 * they can't act), then Re-fit (Re-center group path) when the ends moved, and Remove path.
 */
export const PATH_FIELD_MENU = [
    "editPath",
    "editLine",
    "detachPath",
    "rejoinPath",
    "adjustResetSpot",
    "refitPath",
    "removePath",
] as const;

/** The field's menu on a trail (pathways step 4): open it, turn the line around, or take it away */
export const TRAIL_FIELD_MENU = [
    "editPath",
    "reverseTrail",
    "removePath",
] as const;

/** The field's menu on `target`'s line: the Path group, a trail's own for a trail */
export const pathFieldMenu = (target: PathTarget): readonly string[] =>
    target.trail ? TRAIL_FIELD_MENU : PATH_FIELD_MENU;

/** An open group path's lanes as they walk now, cached per session state (decision C) */
let walksMemo: {
    target: PathSession["target"];
    points: PathSession["points"];
    laneEdit: PathSession["laneEdit"];
    walks: { marcherId: number; walk: GroupMemberWalk }[];
} | null = null;
function laneWalks(s: PathSession) {
    // By what they're built from, not the session object: a hover makes a new session each time
    if (
        walksMemo?.target === s.target &&
        walksMemo.points === s.points &&
        walksMemo.laneEdit === s.laneEdit
    )
        return walksMemo.walks;
    const shape = shapeOf(s);
    const schedule = scheduleOf(shape);
    const walks = (s.target.group?.members ?? []).map((m) => ({
        marcherId: m.marcherId,
        walk: memberWalkOf(schedule, memberNow(s, m), shape.points),
    }));
    walksMemo = {
        target: s.target,
        points: s.points,
        laneEdit: s.laneEdit,
        walks,
    };
    return walks;
}

/**
 * A lane's Adjust as drawn now, which the handles' key numbers refer to: between a save and the
 * read that follows, that's still the preview
 */
function adjustNow(s: PathSession, marcherId: number) {
    const member = memberOf(s, marcherId);
    return member ? (memberNow(s, member).adjust ?? null) : null;
}

/** A press on a lane or an Adjust key, while it's held (decision C) */
interface LaneHold {
    marcherId: number;
    /** The key held; null for a press on the lane's line */
    index: number | null;
    /** The place held, or null on a leg */
    x: number | null;
    /** Where the lane was under the press */
    at: XY;
    /** Where it runs with no Adjust, at `x` */
    plain: XY | null;
    base: AdjustProfile | null;
    /** A refusal was said: this drag writes nothing */
    refused: boolean;
    /** The displacement the drag asks for now, once it moved */
    d: [number, number] | null;
    /** How many lanes lie under the press, and which comes after this one */
    stacked: number;
    next: number;
}

/** Lanes this close together (field units) are one on top of the other under a press */
const LANE_STACK_TOLERANCE = 0.25;

const refusalKeys = {
    tooShort: "timeline.refusals.route.adjustTooShort",
    outside: "timeline.refusals.route.adjustOutside",
    tooClose: "timeline.refusals.route.adjustTooClose",
} as const;

/**
 * The path pen on the field (pathways steps 1 and 2), working as the shape tool's Line does:
 *
 * - Drawing: a click places the next point, a corner, landed on its release (on the half-step
 *   grid or a field line; off the grid with fine, at 45° from the last with constrain). A
 *   press-and-drag places a smooth point where it was pressed instead, its roundness how far the
 *   drag went (in tenths, fine for any), its tangent bar shown while dragging. A
 *   double-click, a click on the last point or on the end spot, or Enter finishes; a right-click,
 *   Backspace or undo takes the last point back; Escape cancels.
 * - Quiet (closed: the selected marchers' path, shown): the path takes no press, so drags and
 *   marquees around it are the field's, and a dot under the press is the dot's (P-1). A click or
 *   tap on its line, or on one of Paths All's paths (AP-O2), selects the marchers who walk it (on
 *   a member's lane, that marcher) and makes it active at once (interaction system, rules 1 and
 *   2); a double-click does nothing more. A right-click or long press on a line selects its
 *   walkers too and opens the field's menu with the Path group.
 * - Open: the path takes only presses on its handles, so the marchers stay selectable. A click on
 *   a point selects it, and a selected smooth point shows its tangent bar, whose ends drag its
 *   roundness; a double-click on a point swaps corner and smooth; a drag moves a point (fine off
 *   the grid, constrain keeping its direction), saved on release as one undo step; a click on a
 *   leg's midpoint adds a point there, and a drag adds one and moves it. A right-click or long
 *   press opens a point's menu (Corner | Smooth, Roundness, Delete point) or a leg's (Add point
 *   here, Straight | Curved), and elsewhere on the line the field's menu with the Path group. A
 *   click on a member's lane selects that marcher and picks its lane. A click on empty field
 *   changes the selection, which takes the path away.
 *
 * The held-roles chip names what a drag reads, from the press, as it does for a shape's handles.
 */
class PathPenMode implements FieldMode {
    private held: {
        start: FieldPointer;
        /** The handle pressed on the open path, or null (drawing, or a miss) */
        key: string | null;
        base: PathShape;
        before: readonly PathPoint[];
        moved: boolean;
        /**
         * Drawing: where the press landed a point, made smooth once the drag leaves the slop; null
         * when the press was on the last point or the end spot, which finishes on release however
         * far it moved (review of #680)
         */
        landed: XY | null;
        /** Where the pointer is, for the chip */
        screen: XY;
        keys: HeldGesture<FieldPointer>;
        /** A press on an adjustable lane or one of its keys, not on the path's own handles */
        lane: LaneHold | null;
        /** The Follow tool (step 4b): the press on an end that draws the trail's first leg */
        firstLeg?: boolean;
    } | null = null;
    private listeners = new Set<() => void>();

    constructor() {
        usePathPenStore.subscribe(() => {
            for (const l of this.listeners) l();
        });
    }

    private get session() {
        return usePathPenStore.getState().session;
    }

    /** The session when its path is drawn now (a closed one can be hidden), else null */
    private get shownSession() {
        const { session, hidden } = usePathPenStore.getState();
        return pathShown(session, hidden) ? session : null;
    }

    get ownsSelectionBox() {
        return this.session?.phase === "drawing";
    }
    get locksSelection() {
        return this.session?.phase === "drawing";
    }
    get blocksFieldMenu() {
        return this.session?.phase === "drawing";
    }
    get gesture() {
        return {
            kind: "path" as const,
            always: this.session?.phase === "drawing",
        };
    }

    private handleAt(s: PathSession, pointer: Pick<FieldPointer, "field">) {
        const env = envOf();
        // With a lane in focus the group path's handles aren't drawn, so nothing can grab them
        return env && laneInFocus(s) === null
            ? pathHandleAt(shapeOf(s), pointer.field, env, s.selected)
            : null;
    }

    /**
     * Whether `pointer` is on a line the path draws now, open or closed: its own line when it's
     * drawn (a quiet group path draws only its selected marchers' lines), or a lane
     */
    private onLine(s: PathSession, pointer: Pick<FieldPointer, "field">) {
        const env = envOf();
        if (s.phase === "drawing" || !env) return false;
        const drawn = drawingOf(s);
        if (drawn?.outline && onPath(shapeOf(s), pointer.field, env))
            return true;
        // A group path's lanes open it too (step 15)
        const lanes = drawn?.lanes ?? [];
        return lanes.some((lane) => onLine(lane, pointer.field, env.hitRadius));
    }

    /**
     * The path whose drawn line is under `pointer` (AP-O3): the one shown first, then Paths All's
     * paths, in route order. Null when none is.
     */
    private pathAt(
        pointer: Pick<FieldPointer, "field">,
    ): { session: PathSession } | { object: PathObject } | null {
        const s = this.shownSession;
        if (s && this.onLine(s, pointer)) return { session: s };
        const env = envOf();
        if (!env || s?.phase === "drawing") return null;
        const { objects } = usePathPenStore.getState();
        const hit = objectsDrawn(objects, s, false).find((o) =>
            objectHit(o, pointer.field, env.hitRadius),
        );
        return hit ? { object: hit } : null;
    }

    /**
     * The Adjust key or lane under `pointer` on the open group path (decision C), or null. The
     * path's own handles and its bold line win where they overlap; a dot is the dot's. Keys before
     * lines, and of the lines the nearest. With a lane in focus that lane is the heavy one, so it
     * wins over the muted group line, which still wins over the other lanes.
     */
    private laneAt(
        s: PathSession,
        pointer: Pick<FieldPointer, "field">,
    ): LaneHold | null {
        const env = envOf();
        if (s.phase !== "open" || !s.target.group || !env) return null;
        if (this.handleAt(s, pointer)) return null;
        const walks = laneWalks(s);
        let bestKey: { d: number; hold: LaneHold } | null = null;
        const keysOf = laneInFocus(s);
        for (const { marcherId, walk } of walks) {
            // Only the lane being adjusted shows its keys, so only its keys are grabbed
            if (keysOf === null || marcherId !== keysOf) continue;
            for (const h of adjustHandlesOf(walk)) {
                const d = Math.hypot(
                    h.at.x - pointer.field.x,
                    h.at.y - pointer.field.y,
                );
                if (d <= env.hitRadius && (!bestKey || d < bestKey.d))
                    bestKey = {
                        d,
                        hold: {
                            marcherId,
                            index: h.index,
                            x: h.x,
                            at: h.at,
                            plain: lanePlain(walk, h.x),
                            base: adjustNow(s, marcherId),
                            refused: false,
                            d: null,
                            stacked: 1,
                            next: marcherId,
                        },
                    };
            }
        }
        if (bestKey) return bestKey.hold;
        const focus = laneInFocus(s);
        // Adjusting one lane, it's the only one drawn and the only one to grab (interaction
        // round 2: testers bent the wrong marcher's faint lane)
        if (focus === null && onPath(shapeOf(s), pointer.field, env))
            return null;
        // Lanes of one row of a block lie on top of each other along a leg that runs with the
        // row: every lane this near is under the press. The one picked keeps it; a click on it
        // goes to the next (`releaseLane`), as a click cycles through stacked layers in a drawing
        // app
        const hits = walks.flatMap(({ marcherId, walk }) => {
            if (focus !== null && marcherId !== focus) return [];
            const hit = laneHitOf(walk, pointer.field, env.hitRadius);
            return hit ? [{ marcherId, walk, hit }] : [];
        });
        if (hits.length === 0) return null;
        const nearest = Math.min(...hits.map((h) => h.hit.distance));
        const stacked = hits.filter(
            (h) => h.hit.distance <= nearest + LANE_STACK_TOLERANCE,
        );
        const on =
            stacked.find((h) => h.marcherId === s.lane?.marcherId) ??
            stacked[0]!;
        const after = stacked[(stacked.indexOf(on) + 1) % stacked.length]!;
        return {
            marcherId: on.marcherId,
            index: null,
            x: on.hit.x,
            at: on.hit.at,
            plain: on.hit.x === null ? null : lanePlain(on.walk, on.hit.x),
            base: adjustNow(s, on.marcherId),
            refused: false,
            d: null,
            stacked: stacked.length,
            next: after.marcherId,
        };
    }

    claims(pointer: FieldPointer, press: FieldModePress): boolean {
        const s = this.session;
        if (!s || pointer.button !== 0 || s.phase === "closed") return false;
        if (s.phase === "drawing") return true;
        if (usePathPenStore.getState().saving) return false;
        if (this.handleAt(s, pointer) !== null) return true;
        return !press.onDot() && this.laneAt(s, pointer) !== null;
    }

    press(pointer: FieldPointer, { isMac }: { isMac: boolean }): void {
        const s = this.session;
        if (!s) return;
        this.endHeld();
        // The Follow tool, its ends pulsing: a press on an end grabs it and drags out the first
        // leg; a marcher in the middle of the line, or the empty field, takes no press (DL-4)
        if (s.phase === "drawing" && s.follow && s.follow.grabbed === null) {
            const env = envOf();
            const hit = env
                ? followHit(s.follow, pointer.field, env.hitRadius)
                : null;
            if (!hit?.end) return;
            grabEnd(hit.id);
            const grabbed = this.session!;
            const keys = holdGesture<FieldPointer>(
                pointer,
                (at, roles) => this.follow(at, roles),
                [],
                isMac,
                {
                    honored: honored(shapeOf(grabbed), null),
                    screen: () => this.held?.screen ?? pointer.screen,
                },
            );
            this.held = {
                start: pointer,
                screen: pointer.screen,
                key: null,
                base: shapeOf(grabbed),
                before: [],
                moved: false,
                landed: null,
                keys,
                lane: null,
                firstLeg: true,
            };
            return;
        }
        const base = shapeOf(s);
        const key =
            s.phase === "open"
                ? (this.handleAt(s, pointer)?.key ?? null)
                : null;
        const lane = key === null ? this.laneAt(s, pointer) : null;
        const keys = holdGesture<FieldPointer>(
            pointer,
            (at, roles) => this.follow(at, roles),
            [],
            isMac,
            {
                honored: honored(base, key),
                screen: () => this.held?.screen ?? pointer.screen,
            },
        );
        const env = envOf(keys.roles());
        this.held = {
            start: pointer,
            screen: pointer.screen,
            key,
            base,
            before: s.points,
            moved: false,
            landed:
                s.phase === "drawing" &&
                env &&
                !onFinishSpot(s, pointer.field, env)
                    ? landCorner(base, pointer.field, env)
                    : null,
            keys,
            lane,
        };
        if (s.phase === "drawing") this.preview(pointer, keys.roles());
    }

    private endHeld() {
        this.held?.keys.end();
        this.held = null;
    }

    /** While drawing, the next corner where a click now would put it */
    private preview(pointer: Pick<FieldPointer, "field">, roles: Roles) {
        const s = this.session;
        const env = envOf(roles);
        if (!s || s.phase !== "drawing" || !env) return;
        // The Follow tool's ends still pulse: nothing is drawn yet
        if (s.follow && s.follow.grabbed === null) return;
        const at = landCorner(shapeOf(s), pointer.field, env);
        // The Follow tool plans the line to the pointer (step 4d): once a frame at most
        if (s.follow) this.pointerSoon(at);
        else this.pointerNow(at);
    }

    /** The pointer the Follow tool's next frame plans to, and that frame (step 4d) */
    private pendingPointer: XY | null = null;
    private pointerFrame: number | null = null;

    /**
     * Sets the drawing's pointer on the next animation frame, the latest of the moves before it:
     * the Follow tool plans the whole line to it, which for a big line costs a few milliseconds
     */
    private pointerSoon(at: XY) {
        if (typeof requestAnimationFrame !== "function") {
            this.pointerNow(at);
            return;
        }
        this.pendingPointer = at;
        // The drawing it was asked for: a frame landing on another one (a new grab) does nothing
        const follow = this.session?.follow ?? null;
        this.pointerFrame ??= requestAnimationFrame(() => {
            this.pointerFrame = null;
            const next = this.pendingPointer;
            this.pendingPointer = null;
            const s = this.session;
            // Only while still drawing out a grabbed end: a cancel or finish in between wins
            if (
                next &&
                s?.phase === "drawing" &&
                s.follow === follow &&
                s.follow?.grabbed != null
            )
                setPointer(next);
        });
    }

    /** Sets the drawing's pointer now, dropping one waiting for the next frame */
    private pointerNow(at: XY | null) {
        this.dropPendingPointer();
        setPointer(at);
    }

    private dropPendingPointer() {
        if (this.pointerFrame !== null) cancelAnimationFrame(this.pointerFrame);
        this.pointerFrame = null;
        this.pendingPointer = null;
    }

    /** The pointer at `pointer` with `roles`: the drag, or the preview, as they are now */
    private follow(pointer: FieldPointer, roles: Roles) {
        const p = this.held;
        const s = this.session;
        if (!p || !s) return;
        if (s.phase === "drawing") {
            if (p.firstLeg) this.preview(pointer, roles);
            else if (p.moved && p.landed) this.shapeNew(p, pointer, roles);
            else this.preview(pointer, roles);
            return;
        }
        if (p.lane) {
            this.followLane(p, p.lane, pointer, roles, s);
            return;
        }
        if (p.key === null) return;
        const env = envOf(roles);
        if (!env) return;
        const point = pointOf(p.base, p.key);
        const tangent = tangentOf(p.base, p.key);
        const leg = legOf(p.base, p.key);
        // A point drag stops short rather than bring Adjust keys closer than a step (AP-R11)
        const profiles = (s.target.group?.members ?? []).flatMap((m) =>
            m.adjust ? [m.adjust] : [],
        );
        const arc = bulgeLegOf(p.base, p.key);
        const from = leg >= 0 ? splitLeg(p.base, leg) : p.base;
        const next = limitDrag(
            from,
            dragPathHandle(p.base, p.key, pointer.field, env),
            profiles,
        );
        dragPoints(
            next.points,
            point >= 0
                ? point
                : tangent
                  ? tangent.index
                  : arc >= 0
                    ? // an arc's bulge: no point moves, so none shows as dragged
                      -1
                    : leg,
            arc >= 0 ? (next.toBulge ?? null) : undefined,
        );
    }

    /** A lane or key being dragged: the displacement where it was grabbed follows the pointer */
    private followLane(
        p: NonNullable<PathPenMode["held"]>,
        hold: LaneHold,
        pointer: FieldPointer,
        roles: Roles,
        s: PathSession,
    ) {
        if (!p.moved || hold.refused) return;
        const env = envOf(roles);
        if (!env) return;
        if (hold.x === null || hold.plain === null) {
            this.refuseLane(hold, "outside");
            return;
        }
        const shape = shapeOf(s);
        const schedule = scheduleOf(shape);
        // The grabbed place follows the pointer and lands as a point does (fine off the grid)
        const to = landPoint(
            {
                x: hold.at.x + pointer.field.x - p.start.field.x,
                y: hold.at.y + pointer.field.y - p.start.field.y,
            },
            env,
        );
        const d: [number, number] = [to.x - hold.plain.x, to.y - hold.plain.y];
        if (hold.index !== null && !hold.base) return;
        hold.d = d;
        if (hold.index !== null) {
            const keys = pruneZeroKeys(
                hold.base!.keys.map((k, i) =>
                    i === hold.index ? { ...k, d } : k,
                ),
            );
            setLaneEdit({
                marcherId: hold.marcherId,
                adjust: keys ? { v: 1, keys } : null,
            });
            return;
        }
        const placed = placeAdjustKey({
            schedule,
            points: shape.points,
            profile: hold.base,
            x: hold.x,
            d,
        });
        if (!placed.ok) {
            this.refuseLane(hold, placed.reason);
            return;
        }
        setLaneEdit({ marcherId: hold.marcherId, adjust: placed.profile });
    }

    private refuseLane(hold: LaneHold, reason: keyof typeof refusalKeys) {
        hold.refused = true;
        hold.d = null;
        setLaneEdit(null);
        toast.error(tolgee.t(refusalKeys[reason]), { id: "path-adjust" });
    }

    /**
     * While drawing, a press-and-drag: the point lands where it was pressed, smooth, its roundness
     * following the drag. A press on the last point or the end spot finishes instead (on release).
     */
    private shapeNew(
        p: NonNullable<PathPenMode["held"]>,
        pointer: FieldPointer,
        roles: Roles,
    ) {
        const env = envOf(roles);
        const s = this.session;
        if (!env || !s || !p.landed) return;
        const placed: PathShape = {
            ...p.base,
            points: [...p.base.points, { at: p.landed }],
        };
        shapeNewPoint(dragNewPoint(placed, pointer.field, env));
        this.pointerNow(null);
    }

    move(pointer: FieldPointer): void {
        const p = this.held;
        if (!p) {
            if (this.session?.phase === "drawing")
                this.preview(pointer, rolesOf(pointer, "shape"));
            return;
        }
        p.screen = pointer.screen;
        p.moved ||=
            Math.hypot(
                pointer.screen.x - p.start.screen.x,
                pointer.screen.y - p.start.screen.y,
            ) >= CLICK_SLOP;
        const roles = p.keys.move(pointer, p.moved ? pointer : null);
        if (this.session?.phase === "drawing" || p.moved)
            this.follow(pointer, roles);
    }

    release(
        pointer: FieldPointer,
        click: { double: boolean; ownFirst: boolean } | null,
    ): void {
        const p = this.held;
        const roles = p?.keys.roles();
        this.endHeld();
        // What the release does is read from where it is, not a move waiting for its frame
        this.dropPendingPointer();
        const s = this.session;
        if (!p || !s) return;
        if (s.phase === "drawing") {
            // The first leg dragged out of an end (step 4b): its end is the trail's first point;
            // a click on the end only grabs it, and clicks go on from there
            if (p.firstLeg) {
                this.releaseFirstLeg(s, p, pointer, roles);
                return;
            }
            // A press-and-drag placed its smooth point as it went
            if (p.moved && s.dragging !== null) {
                endNewPoint();
                return;
            }
            // Pressed on the last point or the end spot and moved a little: still a finish
            if (p.moved && p.landed === null) {
                void finishDrawing(enterAt(s, pointer.field, envOf(roles)));
                return;
            }
            this.releaseDrawing(s, pointer, click, roles);
            return;
        }
        if (p.lane) {
            this.releaseLane(p, p.lane);
            return;
        }
        if (p.key === null) return;
        if (p.moved) {
            // Moved past the slop with nothing dragged (no field yet): nothing to save
            if (s.dragging === null) return;
            const nowSession = usePathPenStore.getState().session;
            const now = nowSession?.points ?? p.before;
            // An arc's bulge handle changes the last leg's bulge without moving a point (AP-T11)
            const toBulge = {
                now: nowSession?.toBulge ?? null,
                before: p.base.toBulge ?? null,
            };
            if (samePoints(now, p.before) && toBulge.now === toBulge.before) {
                cancelDrag(p.before, toBulge.before);
                return;
            }
            // A midpoint dragged adds its point, which stays unselected; a point dragged keeps
            // the selection only if it was that point; a tangent bar's end keeps its point
            const point = pointOf(p.base, p.key);
            const keep =
                (point >= 0 && p.key === s.selected) ||
                tangentOf(p.base, p.key) !== null;
            // A point, a tangent bar's end or an arc's bulge is a drag that stops short (AP-R11)
            void commitPoints(
                now,
                p.before,
                keep ? s.selected : null,
                point >= 0 ||
                    tangentOf(p.base, p.key) !== null ||
                    bulgeLegOf(p.base, p.key) >= 0,
                toBulge,
            );
            return;
        }
        const point = pointOf(p.base, p.key);
        // A double-click on a point swaps corner and smooth, as a Line's does (#557)
        if (point >= 0 && click?.double && click.ownFirst) {
            void setPointSmooth(
                point,
                !((p.base.points[point]?.tension ?? 0) > 0),
            );
            return;
        }
        // The second click of the double-click whose first made the path active adds nothing
        if (click?.double && !click.ownFirst) {
            if (point >= 0) selectPoint(p.key);
            return;
        }
        // A click: a midpoint adds a point there; a point is selected
        const added = clickPathHandle(p.base, p.key);
        if (added) {
            void commitShape(added, null);
            return;
        }
        if (point >= 0) selectPoint(p.key);
    }

    /** A lane or key let go: saved once it moved (one undo step), otherwise a click that picks it */
    private releaseLane(p: NonNullable<PathPenMode["held"]>, hold: LaneHold) {
        if (!p.moved) {
            // Already picked, with others under it: the click goes to the next one down
            const picked =
                usePathPenStore.getState().session?.lane?.marcherId ===
                hold.marcherId;
            const marcherId =
                picked && hold.stacked > 1 ? hold.next : hold.marcherId;
            // A lane is its marcher (interaction system, rule 1): the click selects it, Shift
            // adds or removes it, as a click on its dot does
            if (p.start.shift) {
                if (!toggleWalker(marcherId)) {
                    selectLane(null);
                    return;
                }
            } else selectWalkers([marcherId], { keepSubset: false });
            selectLane({ marcherId, key: hold.index });
            // The pointer hasn't moved, so the note wouldn't otherwise name the lane just picked
            if (usePathPenStore.getState().session?.hoverLane)
                setHoverLane({ marcherId, at: hold.at, stacked: hold.stacked });
            return;
        }
        if (hold.refused || !hold.d) {
            setLaneEdit(null);
            return;
        }
        // What was just bent is what's being worked on, as a drag selects in a drawing app
        selectLane({ marcherId: hold.marcherId, key: hold.index });
        if (hold.index !== null)
            void commitAdjustKey(hold.marcherId, hold.index, hold.d);
        else void commitLaneAdjust(hold.marcherId, hold.x!, hold.d);
    }

    private releaseDrawing(
        s: PathSession,
        pointer: FieldPointer,
        click: { double: boolean } | null,
        roles: Roles | undefined,
    ) {
        const env = envOf(roles);
        if (!env) return;
        // The double-click's second click finishes, as a Line's does
        if (click?.double) {
            void finishDrawing();
            return;
        }
        // On the last point (a Line's last point), or on the end spot the path goes to
        if (onFinishSpot(s, pointer.field, env)) {
            void finishDrawing(enterAt(s, pointer.field, env));
            return;
        }
        const at = landCorner(shapeOf(s), pointer.field, env);
        // Landed on the last point: the same as clicking it
        const prev = s.points.at(-1)?.at;
        if (prev && prev.x === at.x && prev.y === at.y) {
            void finishDrawing();
            return;
        }
        addPoint(at);
        this.pointerNow(at);
    }

    /**
     * The release of the first leg dragged out of an end (step 4b): its end is the trail's first
     * point; a click on the end only grabs it, and clicks go on from there. Into end spots, a
     * release on the spot the trail runs into finishes with nothing drawn (step 9, RP-6).
     */
    private releaseFirstLeg(
        s: PathSession,
        p: NonNullable<PathPenMode["held"]>,
        pointer: FieldPointer,
        roles: Roles | undefined,
    ) {
        const env = envOf(roles);
        // Into end spots (Keep end spots, Ripple in), released on the spot the trail
        // runs into: finished with nothing drawn, a straight way in (step 9, RP-6)
        if (
            p.moved &&
            env &&
            s.follow &&
            intoEndSpots(s.follow) &&
            onEndSpot(s, pointer.field, env)
        ) {
            void finishDrawing(enterAt(s, pointer.field, env));
            return;
        }
        if (p.moved && env) {
            const at = landCorner(shapeOf(s), pointer.field, env);
            addPoint(at);
            this.pointerNow(at);
        }
    }

    cancel(): void {
        const p = this.held;
        this.endHeld();
        this.dropPendingPointer();
        if (p?.lane) setLaneEdit(null);
        if (!p?.moved) return;
        if (this.session?.phase === "open")
            cancelDrag(p.before, p.base.toBulge ?? null);
        // A lost press-and-drag while drawing takes back the point it was placing
        else if (this.session?.dragging !== null) {
            cancelDrag(p.before);
        }
    }

    cursorAt(
        pointer: FieldPointer,
        hover?: FieldModeHover,
    ): FieldCursor | null {
        const s = this.session;
        // A path's line, shown or one of Paths All's, is something to click (AP-O3); not under a
        // marcher's dot, which a press there selects instead
        if (!s || s.phase === "closed")
            return !hover?.onDot() && this.pathAt(pointer) ? "pointer" : null;
        // Between clicks the next leg follows the pointer with the roles its keys hold, so it
        // lands where a click would, as a Line's does
        if (s.phase === "drawing") {
            // The Follow tool's ends pulse: the hand over an end, nothing elsewhere (DL-4)
            if (s.follow && s.follow.grabbed === null) {
                const env = envOf();
                const hit = env
                    ? followHit(s.follow, pointer.field, env.hitRadius)
                    : null;
                // A middle marcher takes no press: the note by it says to grab an end
                setFollowHover(hit && !hit.end ? hit.id : null);
                return hit?.end ? "grab" : "default";
            }
            this.preview(pointer, rolesOf(pointer, "shape"));
            return "crosshair";
        }
        const handle = this.handleAt(s, pointer);
        if (handle) {
            setHoverLane(null);
            return asCursor(handle.cursor);
        }
        const lane = hover?.onDot() ? null : this.laneAt(s, pointer);
        setHoverLane(
            lane
                ? {
                      marcherId: lane.marcherId,
                      at: lane.at,
                      stacked: lane.stacked,
                  }
                : null,
        );
        if (lane) return lane.index !== null ? "move" : "grab";
        return null;
    }

    leave(): void {
        if (this.session?.phase === "drawing") {
            this.pointerNow(null);
            setFollowHover(null);
        } else if (this.session?.hoverLane) setHoverLane(null);
    }

    /**
     * While drawing, a right-click (a Mac's Ctrl-click, a long press) takes the last point back,
     * as it does a Line's last point. On the open path, a point's or a leg's menu, as a Line's: a
     * Corner | Smooth pick keeps the menu open, showing the change.
     */
    openMenu(pointer: FieldPointer): boolean {
        const s = this.session;
        if (!s || s.phase === "closed") return false;
        if (s.phase === "drawing") return removeLastPoint();
        const handle = this.handleAt(s, pointer);
        const lane = handle ? null : this.laneAt(s, pointer);
        // An Adjust key's menu, or an adjusted lane's; a plain lane has the field's
        const adjusted =
            lane && memberOf(s, lane.marcherId)?.adjust
                ? lane.index !== null
                    ? adjustKey(lane.marcherId, lane.index)
                    : laneKey(lane.marcherId)
                : null;
        if (adjusted && lane)
            selectLane({ marcherId: lane.marcherId, key: lane.index });
        const menuKey = handle?.key ?? adjusted;
        return openHandleMenu(
            MENU_KIND,
            shapeOf(s),
            1,
            menuKey ? { type: "handle", key: menuKey } : null,
            pointer.screen,
            (key, value) => {
                const now = usePathPenStore.getState().session;
                if (!now || now.phase !== "open") return null;
                const onKey = adjustKeyOf(key);
                if (value === "removeKey" && onKey) {
                    void deleteAdjustKey(onKey.marcherId, onKey.index);
                    return null;
                }
                if (value === "resetSpot" && lane) {
                    void resetSpot(lane.marcherId);
                    return null;
                }
                const shape = shapeOf(now);
                const point = pointOf(shape, key);
                // Deleting the last point removes the path (AP-R2)
                if (value === "delete" && point >= 0) {
                    void deletePoint(point);
                    return null;
                }
                const env = envOf();
                const picked = env
                    ? PATH_MENU.pick(shape, 1, key, value, env)
                    : null;
                if (!picked) return null;
                if (!sameShape(picked.params, shape))
                    void commitShape(picked.params, picked.selected);
                else if (picked.selected !== undefined)
                    selectPoint(picked.selected);
                // Corner | Smooth and Straight | Curved | Arc stay open, showing the change;
                // the others do one thing and close
                return [
                    "corner",
                    "smooth",
                    "straight",
                    "curved",
                    "arc",
                ].includes(value)
                    ? { params: picked.params, n: 1 }
                    : null;
            },
        );
    }

    /**
     * The path whose line is under `pointer`, as a click or right-click takes it: its target and
     * name, and the member whose lane is under it, if the press missed the line itself (a group
     * path's lanes, not a trail's or a one-lane copy's). Null with no stored path's line there.
     */
    private lineHit(pointer: Pick<FieldPointer, "field">): {
        target: PathTarget;
        drill: string;
        lane: number | null;
        /** The line is a selected marcher's off the group path (its own path, or a copy) */
        outside: boolean;
    } | null {
        const hit = this.pathAt(pointer);
        if (!hit) return null;
        const { target, drill } = "object" in hit ? hit.object : hit.session;
        if (target.routeId === null) return null;
        const env = envOf();
        const drawn =
            "object" in hit
                ? objectDrawingOf(hit.object)
                : drawingOf(hit.session);
        const shape = "object" in hit ? null : shapeOf(hit.session);
        let lane: number | null = null;
        const members = target.group?.members ?? [];
        // The path's own line, when it's drawn (a quiet group path draws only its marchers' lines)
        const onReference =
            !env ||
            (drawn?.outline
                ? shape
                    ? onPath(shape, pointer.field, env)
                    : onLine(drawn.outline, pointer.field, env.hitRadius)
                : false);
        if (env && !onReference && !target.trail && !target.lane && drawn) {
            let best = Infinity;
            (drawn.lanes ?? []).forEach((line, i) => {
                const near = lineDistance(line, pointer.field);
                const id = drawn.laneIds?.[i] ?? members[i]?.marcherId;
                if (near <= env.hitRadius && near < best && id !== undefined) {
                    best = near;
                    lane = id;
                }
            });
        }
        const outside =
            lane !== null && !members.some((m) => m.marcherId === lane);
        return { target, drill, lane, outside };
    }

    /**
     * A right-click or long press on a path's line (no handle took it): its walkers are selected,
     * as a right-click on an unselected marcher selects it (kept when they're some of them
     * already), the path is shown for them, and the field's menu offers the Path group
     * (interaction system, rule 4). Null off every line.
     */
    fieldMenuAt(pointer: FieldPointer): readonly string[] | null {
        const hit = this.lineHit(pointer);
        if (!hit) return null;
        selectWalkers(hit.lane !== null ? [hit.lane] : walkersOf(hit.target));
        // A line off the group path is its marcher's own: its path is read for it, selected
        if (!hit.outside) focusPath(hit.target, hit.drill);
        return pathFieldMenu(hit.target);
    }

    /**
     * A click or tap on a path's line (interaction system, rules 1 and 2): its walkers are
     * selected (kept when they're some of them already; Shift adds them), or on a member's lane
     * that marcher, and the path is active at once, with its handles and the full bar. On the
     * active path's line, with a lane in focus, the lane is let go and its walkers are selected
     * again. A double-click opens nothing more than a click (its second click is a click). A
     * click off every line is the field's, which changes the selection.
     */
    takeClick(pointer: FieldPointer, _double: boolean): boolean {
        const hit = this.lineHit(pointer);
        if (!hit) return false;
        // A selected marcher's line off the group path (its own path, or a Detached copy): that
        // marcher alone is selected, and its own path opens once it's read for it
        if (hit.outside && hit.lane !== null) {
            if (pointer.shift) toggleWalker(hit.lane);
            else {
                usePathPenStore.setState({ openNext: hit.lane });
                if (!selectWalkers([hit.lane], { keepSubset: false }))
                    usePathPenStore.setState({ openNext: null });
            }
            return true;
        }
        const s = this.session;
        if (
            s?.phase === "open" &&
            pathKey(s.target) === pathKey(hit.target) &&
            hit.lane === null
        ) {
            if (s.lane) {
                selectLane(null);
                selectWalkers(walkersOf(s.target), { keepSubset: false });
            }
            return true;
        }
        const changes =
            hit.lane !== null && pointer.shift
                ? (toggleWalker(hit.lane), true)
                : selectWalkers(
                      hit.lane !== null ? [hit.lane] : walkersOf(hit.target),
                      { add: pointer.shift, keepSubset: hit.lane === null },
                  );
        activatePath(hit.target, hit.drill, hit.lane, changes);
        return true;
    }

    drawing(): FieldModeDrawing | null {
        return drawingOf(this.shownSession);
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

let last: {
    session: PathSession | null;
    selected: readonly number[];
    drawing: FieldModeDrawing | null;
} = {
    session: null,
    selected: [],
    drawing: null,
};

/**
 * What the pen draws: the path from where the marcher starts (its ghost) through the corners to
 * its end spot, the same open or closed; once open, its handles as a Line's are drawn (squares on
 * the corners, the selected one filled, small round ones mid-leg), and while drawing a leg to where the next corner would land,
 * with where that is in drill terms. While the pointer lands a corner on one of the field's lines,
 * a guide along it, named as the coordinate sheet writes it, as for a Line's points. Worked out
 * once per session state: the overlay reads it as a snapshot.
 */
export function drawingOf(
    session: PathSession | null,
    /** The selected members of the group path shown: whose lines a quiet group path draws */
    selected: readonly number[] = usePathPenStore.getState().ownable,
): FieldModeDrawing | null {
    if (session === last.session && selected === last.selected)
        return last.drawing;
    const drawing = session
        ? session.follow
            ? followDrawing(session)
            : buildDrawing(session, selected)
        : null;
    last = { session, selected, drawing };
    return drawing;
}

/**
 * The Follow tool's drawing (step 4b): before an end is pressed, a ring on every member with the
 * two ends' pulsing; then the trail from the leader's start through the points to where the next
 * would land, the line-up thin, and where the line stops (the end spots, `P(e_q)`, as written)
 * with the line through them, the end shape's preview.
 */
function followDrawing(session: PathSession): FieldModeDrawing {
    const follow = session.follow!;
    const ends = followEnds(follow);
    const line = trailLine(follow);
    const grabbed = follow.grabbed !== null;
    const starts = line.map((id) => lineOf(follow).starts.get(id)!);
    const shape = shapeOf(session);
    // Keep end spots (AP-T9): the spots the line has, step 4's trail running on into the tail's;
    // Ripple in (step 9): the next form's spots as dealt, the trail running on into its entrance;
    // From trail (AP-T8): where the line stops, as written
    const keep = grabbed && intoEndSpots(follow);
    const ripple =
        grabbed && ripplesIn(follow) ? rippleDrawnPlanOf(session) : null;
    // With the pointer as the next point while drawing (step 4d); the write is what's placed
    const plan = keep ? null : followDrawnPlanOf(session);
    const trail = followHasTrail(session);
    const spots =
        (ripple ?? plan)?.spots.map(([x, y]) => ({ x, y })) ??
        (keep ? session.target.trail!.members.map((m) => m.to) : []);
    // The next leg to the pointer: From trail ends there; Keep end spots runs on to the tail's spot
    const drawn = session.pointer
        ? { ...shape, points: [...session.points, { at: session.pointer }] }
        : shape;
    const outline = !grabbed
        ? null
        : pathOutline(
              keep || !session.pointer
                  ? drawn
                  : {
                        ...drawn,
                        to: session.pointer,
                        ends: { from: shape.from, to: session.pointer },
                    },
          );
    const moving = grabbed ? session.pointer : null;
    const tipText = moving ? drillTerms(moving) : null;
    const leaderLabel = tolgee.t("pathways.rings.leader", "Leads the line");
    return {
        outline,
        openOutline: true,
        pathLine: "edited",
        stage: "drawing",
        spots: trail ? spots : [],
        walks: [],
        handles: session.points.map((c) => c.at),
        addHandles: [],
        selectedHandles: [],
        rings: [],
        lanes: [starts, ...(trail ? [spots] : [])].filter((l) => l.length > 1),
        memberRings: line.map((id, q) => {
            const end = ends.includes(id);
            return {
                at: starts[q]!,
                marcherId: id,
                kind: grabbed
                    ? id === follow.grabbed
                        ? "own"
                        : "group"
                    : end
                      ? "own"
                      : "group",
                label: grabbed
                    ? id === follow.grabbed
                        ? leaderLabel
                        : tolgee.t(
                              "pathways.rings.follower",
                              "Follows the leader",
                          )
                    : end
                      ? tolgee.t(
                            "pathways.rings.dragEnd",
                            "Drag a trail out of this end",
                        )
                      : tolgee.t(
                            "pathways.rings.follower",
                            "Follows the leader",
                        ),
                ...(!grabbed && end ? { pulse: true } : {}),
            };
        }),
        ...(grabbed ? {} : { pullArrows: pullArrowsOf(follow) }),
        ...guidesFor(moving ? [moving] : [], outline ?? []),
        ...(tipText && moving ? { tip: { at: moving, text: tipText } } : {}),
        ...grabEndTip(follow),
        ...realMarchers(session, starts, line, keep ? spots : null),
    };
}

/** Over a middle marcher before an end is grabbed (step 4d): the note to drag from an end */
function grabEndTip(follow: FollowDrag): Pick<FieldModeDrawing, "tip"> {
    if (follow.grabbed !== null || follow.hover == null) return {};
    return {
        tip: {
            at: lineOf(follow).starts.get(follow.hover)!,
            text: tolgee.t(
                "pathways.rings.grabEnd",
                "Drag from an end of the line",
            ),
        },
    };
}

/**
 * Step 4d's grab cue: on each end of the line, chevrons pointing out along the line's own way
 * there, from the marcher next to it to the end. None for a line of one, which has no way.
 */
function pullArrowsOf(
    follow: FollowDrag,
): NonNullable<FieldModeDrawing["pullArrows"]> {
    const { order, starts } = lineOf(follow);
    if (order.length < 2) return [];
    return (
        [
            [order[0]!, order[1]!],
            [order.at(-1)!, order.at(-2)!],
        ] as const
    ).flatMap(([end, next]) => {
        const at = starts.get(end)!;
        const from = starts.get(next)!;
        const d = Math.hypot(at.x - from.x, at.y - from.y);
        if (!(d > 0)) return [];
        return [
            {
                at,
                dir: { x: (at.x - from.x) / d, y: (at.y - from.y) / d },
            },
        ];
    });
}

/**
 * Step 4c (DL-16, DL-17): the line's real marchers where they will stand, or walking with
 * ▶ Preview, and their starts as the shape tool's ghosts (#417). Until there's a trail they stand
 * at the start flag, where the rings are (step 4d): the line is drawn once, where it's grabbed.
 * With Keep end spots they stand on the spots they have (`kept`).
 */
function realMarchers(
    session: PathSession,
    starts: readonly XY[],
    line: readonly number[],
    kept: readonly XY[] | null,
): Pick<FieldModeDrawing, "marchersAt" | "rings" | "ringIds"> {
    const marchersAt =
        followMarchersOf(session) ?? (kept ? { ids: line, spots: kept } : null);
    if (marchersAt) return { marchersAt, rings: starts, ringIds: line };
    return { marchersAt: { ids: line, spots: starts } };
}

/**
 * `drawingOf`'s work, uncached. `selected`: the selected members of a quiet group path, whose
 * lines are drawn. `asObject`: Paths All's drawing of a group path nothing selects (AP-O7).
 */
function buildDrawing(
    session: PathSession,
    selected: readonly number[] = [],
    asObject = false,
): FieldModeDrawing {
    const { target, pointer, selected: selectedKey } = session;
    const drawingNow = session.phase === "drawing";
    const shape = shapeOf(session);
    const view = asObject ? null : groupViewOf(session);
    // A quiet group path draws only its selected marchers' lines, and an adjusted lane only
    // itself: no group line then (interaction round 2)
    const noLine = view === "selected" || view === "adjust";
    const middle = session.points.map((c) => c.at);
    // While drawing, the next leg runs to where the next point would land, straight
    const outline = noLine
        ? null
        : drawingNow && pointer
          ? [
                ...pathOutline({
                    ...shape,
                    to: pointer,
                    ends: { from: shape.from, to: pointer },
                }),
                target.to,
            ]
          : pathOutline(shape);
    // While a press-and-drag shapes the point just placed, its tangent bar
    const shaping =
        drawingNow && session.dragging !== null
            ? ([1, -1] as const).flatMap((side) => {
                  const at = tangentHandle(shape, session.dragging!, side);
                  return at ? [{ at, from: middle[session.dragging!]! }] : [];
              })
            : [];
    const handles = drawingNow
        ? {
              handles: middle,
              addHandles: [],
              selectedHandles: [],
              barHandles: shaping,
          }
        : session.phase === "closed" || laneInFocus(session) !== null
          ? { handles: [], addHandles: [], selectedHandles: [] }
          : handleDrawing(
                {
                    handles: (_p, _n, sel) => pathHandles(shape, sel ?? null),
                },
                shape,
                1,
                selectedKey,
            );
    // The point being placed or dragged: guides where it's on a field line, and where it is
    const moving = drawingNow
        ? (pointer ??
          (session.dragging === null ? null : middle[session.dragging]!))
        : session.dragging === null
          ? null
          : (middle[session.dragging] ?? null);
    const tipText = moving ? drillTerms(moving) : null;
    const group = target.group;
    const {
        lanes,
        laneIds,
        lanesWeight,
        memberRings,
        laneHighlights,
        lanePicked,
        adjustHandles,
        lanesAdjusted,
        addHandles: bendSpots,
    } = target.trail
        ? trailParts(target.trail)
        : groupParts(session, shape, asObject ? "object" : view, selected);
    const laneTip = moving ? null : laneTipOf(session);
    // Whose end spots and start ghosts show: a quiet group path's or an adjusted lane's own
    // marchers only, so one selected marcher doesn't bring the whole group's along
    const shownIds = noLine ? new Set(laneIds ?? []) : null;
    const groupShown = group
        ? group.members.filter((m) => !shownIds || shownIds.has(m.marcherId))
        : [];
    return {
        outline,
        openOutline: true,
        pathLine: pathLineOf(session),
        stage: drawingNow ? "drawing" : "open",
        spots: target.trail
            ? target.trail.members.map((m) => m.to)
            : group
              ? groupShown.map((m) => m.to)
              : [target.to],
        walks: [],
        ...handles,
        rings: target.trail
            ? target.trail.members.map((m) => m.from)
            : group
              ? groupShown.map((m) => m.from)
              : [target.from],
        ringIds: target.trail
            ? target.trail.members.map((m) => m.marcherId)
            : group
              ? groupShown.map((m) => m.marcherId)
              : [target.marcherId],
        ...(lanes ? { lanes } : {}),
        ...(laneIds ? { laneIds } : {}),
        ...(lanesWeight ? { lanesWeight } : {}),
        ...(laneHighlights ? { laneHighlights } : {}),
        ...(lanePicked !== undefined ? { lanePicked } : {}),
        ...(adjustHandles ? { adjustHandles } : {}),
        // A line being edited: where to grab it besides its bend points (round 3)
        ...(bendSpots ? { addHandles: bendSpots } : {}),
        ...(lanesAdjusted ? { lanesAdjusted } : {}),
        ...(memberRings ? { memberRings } : {}),
        ...guidesFor(moving ? [moving] : [], outline ?? []),
        ...(tipText && moving ? { tip: { at: moving, text: tipText } } : {}),
        ...(laneTip ? { tip: laneTip } : {}),
    };
}

/** The note by the pointer over a lane: whose spot it is, and how many lanes lie there */
function laneTipOf(session: PathSession): FieldModeDrawing["tip"] | null {
    const hover = session.phase === "open" ? session.hoverLane : null;
    const hoverMember = hover ? memberOf(session, hover.marcherId) : undefined;
    return hover && hoverMember
        ? {
              at: hover.at,
              text: [
                  tolgee.t(
                      hoverMember.adjust
                          ? "pathways.lanes.hoverAdjusted"
                          : "pathways.lanes.hover",
                      hoverMember.adjust
                          ? "Spot {spot} · {marcher} · bent"
                          : "Spot {spot} · {marcher}",
                      {
                          spot: (hoverMember.slot ?? 0) + 1,
                          marcher: hoverMember.drill,
                      },
                  ),
                  ...((hover.stacked ?? 1) > 1
                      ? [
                            tolgee.t(
                                "pathways.lanes.stacked",
                                "click for the next of {count}",
                                { count: hover.stacked ?? 1 },
                            ),
                        ]
                      : []),
              ].join(" · "),
          }
        : null;
}

/**
 * The spot whose lane is being worked on, picked or in mid-drag (Adjust). While there is one, that
 * lane is the only line drawn, and the only one with handles (AP-R11; interaction round 2).
 */
const laneInFocus = laneFocusOf;

/**
 * How heavy the line is: edited while drawn or open, context behind a lane in focus, selected for
 * a path object (AP-O4)
 */
const pathLineOf = (s: PathSession): FieldModeDrawing["pathLine"] => {
    if (s.phase === "closed") return "shown";
    return laneInFocus(s) !== null ? "context" : "edited";
};

/**
 * A trail's parts of the drawing (pathways step 4): the line-up through the line's starts, tail
 * to leader, and the line through its end spots, from the entrance to the leader's, both thin
 * and faint as a group path's lanes are (the pen's line is the drawn part between them); and a
 * ring on each member, the leader's saying so.
 */
function trailParts(trail: NonNullable<PathTarget["trail"]>): LaneParts {
    const lineUp = trail.members.map((m) => m.from);
    // The line is entered at the tail's end spot and runs on to the leader's
    const endLine = trail.members.map((m) => m.to);
    return {
        lanes: [lineUp, endLine].filter((line) => line.length > 1),
        memberRings: trail.members.map((m) => ({
            at: m.from,
            marcherId: m.marcherId,
            kind: m.marcherId === trail.leaderId ? "own" : "group",
            label:
                m.marcherId === trail.leaderId
                    ? tolgee.t("pathways.rings.leader", "Leads the line")
                    : tolgee.t("pathways.rings.follower", "Follows the leader"),
        })),
    };
}

/** The parts of the drawing a path's lanes and rings make */
type LaneParts = Pick<
    FieldModeDrawing,
    | "lanes"
    | "laneIds"
    | "lanesWeight"
    | "memberRings"
    | "laneHighlights"
    | "lanePicked"
    | "adjustHandles"
    | "lanesAdjusted"
    | "addHandles"
>;

/** How many points a selected marcher's line off the group path is sampled at */
const WALKED_SAMPLES = 64;

/**
 * Where `marcherId` walks from `start` to `end` (beats), as the timeline has it now: the line of a
 * selected marcher off the group path shown (its own path, or a Detached copy). Null with no
 * timeline read yet.
 */
function walkedLine(
    marcherId: number,
    start: number,
    end: number,
): XY[] | null {
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!resolver || !(end > start)) return null;
    const line: XY[] = [];
    for (let i = 0; i <= WALKED_SAMPLES; i++) {
        const p = resolver.positionAt(
            marcherId,
            start + ((end - start) * i) / WALKED_SAMPLES,
        );
        line.push({ x: p[0], y: p[1] });
    }
    return line;
}

/**
 * The rings saying who walks the group path differently, whenever it shows (interaction system
 * rule 5; round 2: also on Paths All's drawing and while the group path is edited): an adjusted
 * member's start ringed blue, a detached member's ringed dashed orange, and the selected marchers
 * off it ringed orange. A plain member has no ring: its lane says it follows.
 */
function differenceRings(
    session: PathSession,
    asObject: boolean,
): NonNullable<FieldModeDrawing["memberRings"]> {
    const group = session.target.group!;
    const detachedLabel = tolgee.t(
        "pathways.rings.detached",
        "Detached: walks its own copy of the group path",
    );
    const outsideIds = new Set(group.outside.map((m) => m.marcherId));
    return [
        ...group.members.flatMap((m) =>
            memberNow(session, m).adjust
                ? [
                      {
                          at: m.from,
                          marcherId: m.marcherId,
                          kind: "group" as const,
                          label: tolgee.t(
                              "pathways.rings.adjusted",
                              "Has bends of its own, and still follows the group path's edits",
                          ),
                      },
                  ]
                : [],
        ),
        ...(group.detachedMembers ?? [])
            .filter((m) => !outsideIds.has(m.marcherId))
            .map((m) => ({
                at: m.from,
                marcherId: m.marcherId,
                kind: "own" as const,
                label: detachedLabel,
                dashed: true,
            })),
        // Paths All's drawing is for nobody selected
        ...(asObject ? [] : group.outside).map((m) => ({
            at: m.from,
            marcherId: m.marcherId,
            kind: "own" as const,
            ...(m.detached ? { dashed: true } : {}),
            label: m.detached
                ? detachedLabel
                : m.ownPath
                  ? tolgee.t("pathways.rings.own", "Own path")
                  : tolgee.t(
                        "pathways.rings.offGroup",
                        "Not on the group path",
                    ),
        })),
    ];
}

/**
 * A group path's parts of the drawing (step 15), by how it's drawn now (`GroupView`; `object` for
 * Paths All's drawing of one nothing selects):
 *
 * - `drawing`: every member's lane, thin and faint, to where the next point would land, and a
 *   ring on each saying it follows.
 * - `selected` (quiet): only the selected members' lanes and the selected marchers' own lines off
 *   it, each at a shown path's weight, as the one line that marcher walks.
 * - `edit` and `object`: every member's lane, thin and faint, round the group line.
 * - `adjust`: the one line being edited (Edit <name>'s line), heavy, with its bend points and the
 *   spots to grab it by (`laneBendSpotsOf`), over its plain lane (faint) when it has bends.
 *
 * The rings say who's different (`differenceRings`), except while drawing.
 */
function groupParts(
    session: PathSession,
    shape: PathShape,
    view: ReturnType<typeof groupViewOf> | "object",
    selected: readonly number[],
): LaneParts {
    const group = session.target.group;
    if (!group) return {};
    const { pointer } = session;
    const laneShape =
        session.phase === "drawing" && pointer
            ? {
                  ...shape,
                  points: [...shape.points, { at: pointer }],
                  ends: shape.ends ?? { from: shape.from, to: shape.to },
              }
            : shape;
    const schedule = scheduleOf(laneShape);
    const walks = group.members.map((m) => ({
        marcherId: m.marcherId,
        walk: memberWalkOf(schedule, memberNow(session, m), laneShape.points),
    }));
    const adjustedIds = new Set(
        group.members
            .filter((m) => memberNow(session, m).adjust)
            .map((m) => m.marcherId),
    );
    if (view === "drawing" || view === null) {
        // A new group path, or a one-lane path (a Detached copy) drawn as its own line
        return {
            lanes: walks.map(({ walk }) => laneOutline(walk)),
            laneIds: walks.map((w) => w.marcherId),
            ...(view === null
                ? {
                      memberRings:
                          session.target.lane?.detachedFrom != null
                              ? differenceRingsOfCopy(group)
                              : [],
                  }
                : {
                      memberRings: group.members.map((m) => ({
                          at: m.from,
                          marcherId: m.marcherId,
                          kind: "group" as const,
                          label: tolgee.t(
                              "pathways.rings.group",
                              "Follows the group path",
                          ),
                      })),
                  }),
        };
    }
    const rings = differenceRings(session, view === "object");
    if (view === "selected") {
        const on = new Set(selected);
        const mine = walks.filter((w) => on.has(w.marcherId));
        const offPath = group.outside.flatMap((m) => {
            const line = walkedLine(
                m.marcherId,
                session.target.start,
                session.target.end,
            );
            return line ? [{ marcherId: m.marcherId, line }] : [];
        });
        const lanes = [
            ...mine.map(({ walk }) => laneOutline(walk)),
            ...offPath.map((o) => o.line),
        ];
        const laneIds = [
            ...mine.map((w) => w.marcherId),
            ...offPath.map((o) => o.marcherId),
        ];
        const adjusted = laneIds.flatMap((id, i) =>
            adjustedIds.has(id) ? [i] : [],
        );
        return {
            lanes,
            laneIds,
            lanesWeight: "path",
            ...(adjusted.length > 0 ? { lanesAdjusted: adjusted } : {}),
            memberRings: rings,
        };
    }
    if (view === "adjust") {
        const focus = laneInFocus(session)!;
        const at = walks.find((w) => w.marcherId === focus);
        if (!at) return { memberRings: rings };
        const member = group.members.find((m) => m.marcherId === focus)!;
        const adjusted = adjustedIds.has(focus);
        // Its plain lane, faint, under the bent one: where the group path alone would take it
        const plain = adjusted
            ? [
                  laneOutline(
                      memberWalkOf(
                          schedule,
                          { ...member, adjust: null },
                          laneShape.points,
                      ),
                  ),
              ]
            : [];
        const picked = session.phase === "open" ? session.lane : null;
        return {
            lanes: [...plain, laneOutline(at.walk)],
            laneIds: [...plain.map(() => focus), focus],
            lanePicked: plain.length,
            adjustHandles: adjustHandlesOf(at.walk).map((h) => ({
                at: h.at,
                selected: picked?.marcherId === focus && picked.key === h.index,
            })),
            addHandles: laneBendSpotsOf(at.walk),
            memberRings: rings,
        };
    }
    // `edit` and `object`: the group line with every member's lane round it. Edited, each lane is
    // the line its marcher walks, at a shown path's weight (round 2: not lighter), so the group line
    // reads as the middle they follow; Paths All's drawing for nobody selected keeps them faint
    const hovered =
        session.phase === "open" ? session.hoverLane?.marcherId : undefined;
    const adjusted = walks.flatMap(({ marcherId }, i) =>
        adjustedIds.has(marcherId) ? [i] : [],
    );
    return {
        lanes: walks.map(({ walk }) => laneOutline(walk)),
        laneIds: walks.map((w) => w.marcherId),
        ...(view === "edit" ? { lanesWeight: "path" as const } : {}),
        ...(adjusted.length > 0 ? { lanesAdjusted: adjusted } : {}),
        laneHighlights: walks.flatMap(({ marcherId }, i) =>
            marcherId === hovered ? [i] : [],
        ),
        adjustHandles: [],
        memberRings: rings,
    };
}

/** A Detached copy shown as its marcher's own path: its start ringed dashed orange */
function differenceRingsOfCopy(
    group: NonNullable<PathTarget["group"]>,
): NonNullable<FieldModeDrawing["memberRings"]> {
    return group.members.map((m) => ({
        at: m.from,
        marcherId: m.marcherId,
        kind: "own" as const,
        label: tolgee.t(
            "pathways.rings.detached",
            "Detached: walks its own copy of the group path",
        ),
        dashed: true,
    }));
}

/** Guides along the field's lines that `points` lie on, as a shape's are drawn while it's edited */
function guidesFor(
    points: readonly XY[],
    outline: readonly XY[],
): Pick<FieldModeDrawing, "guides" | "guideEdges" | "guideMarks" | "onGuides"> {
    const field = currentShapeField();
    if (!field || points.length === 0) return {};
    const env = toolEnvFor(field);
    if (env.pull === false) return {};
    const { width, height } = field.fieldProperties;
    const { guides, edges, marks, on } = edgeGuides(
        outline,
        points,
        [],
        env.fieldLines,
        { width, height },
    );
    if (guides.length === 0) return {};
    return {
        guides: guides.map((g) => {
            const label = lineCoordinate(g.axis, g.at);
            return { from: g.from, to: g.to, ...(label ? { label } : {}) };
        }),
        guideEdges: edges,
        ...(marks.length > 0 ? { guideMarks: marks } : {}),
        onGuides: on,
    };
}

const objectDrawings = new WeakMap<PathTarget, FieldModeDrawing | null>();

/**
 * How Paths All draws a group path object (AP-O7): its reference line, its members' faint lanes,
 * their ghosts and end spots, and the rings that mark who's different (adjusted, detached), so
 * those read with nothing selected (interaction round 2). An own path is drawn by the start flag
 * positions as it was, so it has no drawing of its own (null).
 */
export function objectDrawingOf(o: PathObject): FieldModeDrawing | null {
    if (!drawnAsGroup(o.target)) return null;
    let drawing = objectDrawings.get(o.target);
    if (drawing !== undefined) return drawing;
    drawing = buildDrawing(
        {
            phase: "closed",
            target: o.target,
            drill: o.drill,
            points: pointsOf(o.target),
            ...(o.target.toBulge === undefined
                ? {}
                : { toBulge: o.target.toBulge }),
            pointer: null,
            selected: null,
            dragging: null,
            object: false,
        },
        [],
        true,
    );
    objectDrawings.set(o.target, drawing);
    return drawing;
}

/** Whether `at` is on a path object's drawn line (AP-O3) */
function objectHit(o: PathObject, at: XY, radius: number): boolean {
    if (o.walk) return onLine(o.walk(), at, radius);
    const d = objectDrawingOf(o);
    if (!d) return false;
    return [d.outline ?? [], ...(d.lanes ?? [])].some((line) =>
        onLine(line, at, radius),
    );
}

/** The one pen mode the field editor is given while a path is drawn or open. */
export const pathPenMode = new PathPenMode();

/**
 * Whether `at` is on the end spot the path goes to: with Ripple in, on either end of the next
 * form, by the same reach the drawing shows it with (`rippleEndAt`, RP-4)
 */
function onEndSpot(s: PathSession, at: XY, env: ToolEnv): boolean {
    if (s.follow && ripplesIn(s.follow))
        return rippleEndAt(s.follow, landedAt(s, at, env)) !== null;
    const points = pathPoints(shapeOf(s));
    const end = points[points.length - 1]!;
    return Math.hypot(end.x - at.x, end.y - at.y) <= env.hitRadius;
}

/**
 * Ripple in (step 9, RP-4): the marcher whose spot at an end of the next form is under `at`, so a
 * finish there enters there; null otherwise, and for any other drawing
 */
function enterAt(s: PathSession, at: XY, env: ToolEnv | null): number | null {
    return s.follow && env ? rippleEndAt(s.follow, landedAt(s, at, env)) : null;
}

/**
 * Where a press at `at` lands, as the drawing's pointer does (`landCorner`): Ripple in tests an
 * end of the form with the same point the drawing shows the deal for (step 9 review)
 */
function landedAt(s: PathSession, at: XY, env: ToolEnv): XY {
    return landCorner(shapeOf(s), at, env);
}

/** Whether `at` is on the drawing's last point or on the end spot the path goes to */
function onFinishSpot(s: PathSession, at: XY, env: ToolEnv): boolean {
    const points = pathPoints(shapeOf(s));
    const last = points[points.length - 2]!;
    const end = points[points.length - 1]!;
    const near = (q: XY) => Math.hypot(q.x - at.x, q.y - at.y) <= env.hitRadius;
    // Ripple in: on either end of the next form, by the drawing's own reach (RP-4)
    const onEnd =
        s.follow && ripplesIn(s.follow)
            ? rippleEndAt(s.follow, landedAt(s, at, env)) !== null
            : near(end);
    return (s.points.length > 0 && near(last)) || onEnd;
}
