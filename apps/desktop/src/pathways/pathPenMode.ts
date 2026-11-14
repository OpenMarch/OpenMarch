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
    usePathPenStore,
    type PathObject,
    type PathSession,
} from "./pathPenStore";

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
 * on a marcher with a path (`FieldContextMenu`), each shown only where it applies. Edit path, the
 * member commands (Detach, Rejoin, Reset adjustment), Re-fit when the ends moved, Remove path.
 */
export const PATH_FIELD_MENU = [
    "editPath",
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

    /** Whether `pointer` is on the path's line, open or closed */
    private onLine(s: PathSession, pointer: Pick<FieldPointer, "field">) {
        const env = envOf();
        if (s.phase === "drawing" || !env) return false;
        if (onPath(shapeOf(s), pointer.field, env)) return true;
        // A group path's lanes open it too (step 15)
        const lanes = drawingOf(s)?.lanes ?? [];
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
        for (const { marcherId, walk } of walks)
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
        if (bestKey) return bestKey.hold;
        const focus = laneInFocus(s);
        const onGroupLine = onPath(shapeOf(s), pointer.field, env);
        if (onGroupLine && focus === null) return null;
        // Lanes of one row of a block lie on top of each other along a leg that runs with the
        // row: every lane this near is under the press. The one picked keeps it; a click on it
        // goes to the next (`releaseLane`), as a click cycles through stacked layers in a drawing
        // app
        const hits = walks.flatMap(({ marcherId, walk }) => {
            if (onGroupLine && marcherId !== focus) return [];
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
        // The muted group line: a click on it lets the lane go
        const env = envOf();
        return !hover?.onDot() &&
            env &&
            laneInFocus(s) !== null &&
            onPath(shapeOf(s), pointer.field, env)
            ? "pointer"
            : null;
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
        const onReference =
            !env ||
            (shape
                ? onPath(shape, pointer.field, env)
                : drawn?.outline
                  ? onLine(drawn.outline, pointer.field, env.hitRadius)
                  : false);
        if (env && !onReference && !target.trail && !target.lane && drawn) {
            let best = Infinity;
            (drawn.lanes ?? []).forEach((line, i) => {
                const near = lineDistance(line, pointer.field);
                if (
                    near <= env.hitRadius &&
                    near < best &&
                    members[i] !== undefined
                ) {
                    best = near;
                    lane = members[i]!.marcherId;
                }
            });
        }
        return { target, drill, lane };
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
        focusPath(hit.target, hit.drill);
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

let last: { session: PathSession | null; drawing: FieldModeDrawing | null } = {
    session: null,
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
): FieldModeDrawing | null {
    if (session === last.session) return last.drawing;
    const drawing = session
        ? session.follow
            ? followDrawing(session)
            : buildDrawing(session)
        : null;
    last = { session, drawing };
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

/** `drawingOf`'s work, uncached */
function buildDrawing(session: PathSession): FieldModeDrawing {
    const { target, pointer, selected } = session;
    const drawingNow = session.phase === "drawing";
    const shape = shapeOf(session);
    const middle = session.points.map((c) => c.at);
    // While drawing, the next leg runs to where the next point would land, straight
    const outline =
        drawingNow && pointer
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
                selected,
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
        memberRings,
        laneHighlights,
        lanePicked,
        adjustHandles,
        lanesAdjusted,
    } = target.trail ? trailParts(target.trail) : groupParts(session, shape);
    const laneTip = moving ? null : laneTipOf(session);
    return {
        outline,
        openOutline: true,
        pathLine: pathLineOf(session),
        stage: drawingNow ? "drawing" : "open",
        spots: target.trail
            ? target.trail.members.map((m) => m.to)
            : group
              ? group.members.map((m) => m.to)
              : [target.to],
        walks: [],
        ...handles,
        rings: target.trail
            ? target.trail.members.map((m) => m.from)
            : group
              ? group.members.map((m) => m.from)
              : [target.from],
        ringIds: target.trail
            ? target.trail.members.map((m) => m.marcherId)
            : group
              ? group.members.map((m) => m.marcherId)
              : [target.marcherId],
        ...(lanes ? { lanes } : {}),
        ...(laneHighlights ? { laneHighlights } : {}),
        ...(lanePicked !== undefined ? { lanePicked } : {}),
        ...(adjustHandles ? { adjustHandles } : {}),
        ...(lanesAdjusted ? { lanesAdjusted } : {}),
        ...(memberRings ? { memberRings } : {}),
        ...guidesFor(moving ? [moving] : [], outline),
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
                          ? "Spot {spot} · {marcher} · adjusted"
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
 * The spot whose lane is being worked on, picked or in mid-drag. While there is one, that lane is
 * the only heavy line and the group path is context: thin, grey and without handles (AP-R11).
 */
function laneInFocus(s: PathSession): number | null {
    if (s.phase !== "open") return null;
    return s.laneEdit?.marcherId ?? s.lane?.marcherId ?? null;
}

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
function trailParts(
    trail: NonNullable<PathTarget["trail"]>,
): Pick<
    FieldModeDrawing,
    | "lanes"
    | "memberRings"
    | "laneHighlights"
    | "lanePicked"
    | "adjustHandles"
    | "lanesAdjusted"
> {
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

/**
 * A group path's parts of the drawing (step 15): every member's lane, thin and faint (while
 * drawing, to where the next point would land), and the rings saying who follows it
 */
function groupParts(
    session: PathSession,
    shape: PathShape,
): Pick<
    FieldModeDrawing,
    | "lanes"
    | "memberRings"
    | "laneHighlights"
    | "lanePicked"
    | "adjustHandles"
    | "lanesAdjusted"
> {
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
    const open = session.phase === "open";
    const picked = open ? session.lane : null;
    const focus = laneInFocus(session);
    const hovered = open ? session.hoverLane?.marcherId : undefined;
    const pickedIndex = walks.findIndex((w) => w.marcherId === focus);
    // Who is different, whenever the group path shows (interaction system, rule 5): adjusted
    // lanes in the group ring's color, detached members' starts ringed dashed orange
    const adjusted = group.members.flatMap((m, i) =>
        memberNow(session, m).adjust ? [i] : [],
    );
    const detachedLabel = tolgee.t(
        "pathways.rings.detached",
        "Detached: walks its own copy of the group path",
    );
    const outsideIds = new Set(group.outside.map((m) => m.marcherId));
    return {
        lanes: walks.map(({ walk }) => laneOutline(walk)),
        ...(adjusted.length > 0 ? { lanesAdjusted: adjusted } : {}),
        laneHighlights: walks.flatMap(({ marcherId }, i) =>
            marcherId === hovered && marcherId !== focus ? [i] : [],
        ),
        ...(pickedIndex >= 0 ? { lanePicked: pickedIndex } : {}),
        adjustHandles: open
            ? walks.flatMap(({ marcherId, walk }) =>
                  adjustHandlesOf(walk).map((h) => ({
                      at: h.at,
                      selected:
                          picked?.marcherId === marcherId &&
                          picked.key === h.index,
                  })),
              )
            : [],
        memberRings: [
            ...group.members.map((m) => ({
                at: m.from,
                marcherId: m.marcherId,
                kind: "group" as const,
                label: m.adjust
                    ? tolgee.t(
                          "pathways.rings.adjusted",
                          "Adjusted: bends off the group path in places, and still follows its edits",
                      )
                    : tolgee.t(
                          "pathways.rings.group",
                          "Follows the group path",
                      ),
            })),
            ...(group.detachedMembers ?? [])
                .filter((m) => !outsideIds.has(m.marcherId))
                .map((m) => ({
                    at: m.from,
                    marcherId: m.marcherId,
                    kind: "own" as const,
                    label: detachedLabel,
                    dashed: true,
                })),
            ...group.outside.map((m) => ({
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
        ],
    };
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
 * How Paths All draws a group path object (AP-O7): as the closed path shows it (its reference
 * line, its members' faint lanes, their ghosts and end spots), without the rings that name who
 * follows it, which are for a selection. An own path is drawn by the start flag positions as it
 * was, so it has no drawing of its own (null).
 */
export function objectDrawingOf(o: PathObject): FieldModeDrawing | null {
    if (!drawnAsGroup(o.target)) return null;
    let drawing = objectDrawings.get(o.target);
    if (drawing !== undefined) return drawing;
    const built = buildDrawing({
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
    });
    drawing = built ? { ...built, memberRings: [] } : null;
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
