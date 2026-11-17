import { create } from "zustand";
import { db } from "@/global/database/db";
import { toast } from "sonner";
import { joinList } from "@/timeline/translateTimelineText";
import {
    drawRoute,
    removeRoute,
    removeRouteInTransaction,
    type RoutePointInput,
} from "@/db-functions/timelineRoutes";
import {
    editTrailPoints,
    followTrail,
    removeTrail,
    reverseTrail,
} from "@/db-functions/timelineTrails";
import {
    editPathPoints,
    editPathPointsInTransaction,
    redrawPath,
    redrawPathInTransaction,
    refitPath as refitRoute,
    refitPathInTransaction,
} from "@/db-functions/timelinePathEdits";
import {
    acknowledgeRehomed,
    acknowledgeRehomedInTransaction,
    adjustLane,
    removeAdjustKey,
    resetLaneAdjust,
    setAdjustKey,
} from "@/db-functions/timelinePathAdjust";
import type { RehomeReport } from "@/db-functions/timelineRouteGeometry";
import type { AdjustProfile } from "@openmarch/core";
import {
    drawGroupRouteInTransaction,
    detachFromGroupPath,
    rejoinGroupPath,
} from "@/db-functions/timelineGroupRoutes";
import {
    writeGroupPath,
    type GroupEdit,
    type GroupWrite,
} from "@/db-functions/timelineLoosePaths";
import { subscribeHistoryChanges } from "@/db-functions/history";
import { runAction } from "@/shortcuts/registry";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import tolgee from "@/global/singletons/Tolgee";
import type { XY } from "@/shapes/types";
import { SMOOTH } from "@/shapes/line/lineGeometry";
import { drawnAsGroup, type GroupMember, type PathTarget } from "./pathTarget";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import { dragTrail } from "@/db-functions/timelineTrailDrag";
import { rippleTrail } from "@/db-functions/timelineTrailRipple";
import {
    invalidatePlacedBoxes,
    placedBoxesAt,
} from "@/shapes/placed/placedBoxStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    followSpacingOf,
    intoEndSpots,
    rippleDrawnPlanOf,
    ripplesIn,
    type FollowDrag,
} from "./followDrag";
import {
    besideArc,
    besideArcReason,
    isSmooth,
    pointKey,
    splitLeg,
    withoutPoint,
    withTension,
    type PathPoint,
    type PathShape,
} from "./pathEdit";

export type { PathPoint } from "./pathEdit";

/**
 * The pen's session (pathways steps 1 and 2): a path being drawn for one marcher (`drawing`), the
 * selected marcher's stored path shown on the field (`closed`: drawn, nothing to grab), or opened
 * for editing (`open`) with its points to drag and its floating editor. A double-click or the
 * right-click menu on the path opens it (owner, 2026-11-04). Each write is one app procedure
 * (AP-R1, AP-R2) and one undo step.
 */
export interface PathSession {
    readonly phase: "drawing" | "closed" | "open";
    readonly target: PathTarget;
    /** The marcher's drill number, as the drawing banner names it */
    readonly drill: string;
    readonly points: readonly PathPoint[];
    /** The last leg's bulge (R-14″, step 10a), as the open path has it now; none while drawing */
    readonly toBulge?: number;
    /**
     * While drawing, where a click now would put the next point, landed as a Line's next point
     * is: the preview's leg goes there
     */
    readonly pointer: XY | null;
    /** The point's handle a click picked (open, `p<i>`), which Backspace deletes */
    readonly selected: string | null;
    /**
     * The point being dragged, or whose roundness is (the points shown are the drag's, not yet
     * saved), or null. While drawing, the point a press-and-drag is making smooth.
     */
    readonly dragging: number | null;
    /**
     * The path is selected as an object (step 3a, spec I.10 AP-O3): picked by a click on its line,
     * not shown because its marchers are selected. Then the marcher selection is empty, the path
     * is read again by its route (`findRouteTarget`), it is drawn selected whatever the paths level,
     * Delete removes it (AP-O6), and Escape lets it go (from open, back to selected first).
     */
    readonly object: boolean;
    /**
     * While drawing: the path drawn again by its route id (AP-O8, J.8 AP-R1, 07 N3), a path edit
     * that keeps the id and is never refused for who holds its spots. Set when P draws the
     * selected path or the open path again, however it was opened.
     */
    readonly byRoute?: boolean;
    /** The lane picked on the open group path, and which of its keys if one (step 3b, decision C) */
    readonly lane?: {
        readonly marcherId: number;
        readonly key: number | null;
        /** The picked key just went (removed, or undone away): Delete waits for a new pick */
        readonly keyGone?: boolean;
    } | null;
    /** The lane under the pointer, highlighted and named (decision C) */
    readonly hoverLane?: {
        readonly marcherId: number;
        readonly at: XY;
        readonly stacked?: number;
    } | null;
    /** While a lane or key is dragged: the Adjust it would have, drawn live and saved on release */
    readonly laneEdit?: {
        readonly marcherId: number;
        readonly adjust: AdjustProfile | null;
    } | null;
    /**
     * The Follow tool's drag (pathways step 4b, AP-T8): a trail dragged out of an end of the
     * selected line, its spots written where the line stops. Absent for every other drawing.
     */
    readonly follow?: FollowDrag | null;
}

/**
 * A path Paths **All** draws in a move at the playhead (step 3a, AP-O2, AP-O7), which a click
 * selects with nothing selected. `walk` gives an own path's drawn line, its marcher's walk inside
 * the start flag window (the start flag positions' path, which is what's drawn for it), sampled
 * only when a click or the pointer tests it; null for a group path, drawn as its reference line
 * and faint lanes.
 */
export interface PathObject {
    readonly target: PathTarget;
    readonly drill: string;
    readonly walk: (() => readonly XY[]) | null;
}

interface PathPenState {
    session: PathSession | null;
    /** A save is under way: the pen takes no new edit until it settles */
    saving: boolean;
    /**
     * Counts the saves: the open path reads its move again after each, so a path just finished
     * learns its route (and Remove path shows) even when the timeline caught up during the save
     */
    saved: number;
    /**
     * The closed path isn't drawn and takes no click: start flag positions' paths level in effect
     * is off (owner, 2026-11-04: a path shows by the same rules as the straight ones, the
     * setting and N). An open or drawn path always shows.
     */
    hidden: boolean;
    /**
     * After Detach for one marcher (AP-R9): that marcher's copy opens once it's read again, as the
     * spec's "its own path is then shown, open" says; null otherwise
     */
    openNext: number | null;
    /**
     * A click on a path's line made it active and changed the selection: the path read for the
     * new selection opens if it's this route (`activatePath`); null otherwise
     */
    openRoute: number | null;
    /** Selected marchers on the shown group path, whom Detach gives a copy each (AP-R9) */
    ownable: readonly number[];
    /** Whom Rejoin puts on which group path, or null when it isn't offered (step 15) */
    rejoin: RejoinTarget | null;
    /** The paths Paths All draws as objects at the playhead, or none (step 3a, AP-O2) */
    objects: readonly PathObject[];
    /**
     * With several marchers selected who each walk their own path (no group path, trail or loose
     * path for them), each one's line, drawn faint as a closed path is (round 8: after Detach all
     * the selection showed nothing). None otherwise.
     */
    ownLines: readonly OwnLine[];
}

/** A selected marcher's own path drawn beside the others' (`PathPenState.ownLines`) */
export interface OwnLine {
    readonly target: PathTarget;
    readonly drill: string;
}

/** Rejoin's target (AP-R10): the group path in a move, and the selected marchers off it */
export interface RejoinTarget {
    timelineId: number;
    routeId: number;
    marcherIds: readonly number[];
}

/**
 * Whom Detach acts on (AP-R9): the selected members of the shown group path, or, with none
 * selected, the member whose lane is picked on the open group path (decision C's pick), so a
 * group path opened as an object (a click on its line lets go of the marchers) can still Detach a
 * spot from its bar. None on a one-lane path, which has nobody to Detach from.
 */
export function detachIdsOf(
    ownable: readonly number[],
    session: PathSession | null,
): readonly number[] {
    // A loose path's marchers each have their own copy already (round 7): nobody to Detach
    if (isLoose(session)) return [];
    if (ownable.length > 0) return ownable;
    if (
        session?.phase !== "open" ||
        !session.lane ||
        !session.target.group ||
        session.target.lane
    )
        return [];
    return [session.lane.marcherId];
}

/**
 * Whom Detach all ends the group path for (owner, round 5): every member of the shown group path,
 * when the selection takes them all in (`wholeGroupOf`); none otherwise. Detach on the bar is
 * greyed out then: detaching everyone leaves no group path to rejoin, so it's its own command,
 * under ···, beside Remove path.
 */
export function detachAllIdsOf(
    ownable: readonly number[],
    session: PathSession | null,
): readonly number[] {
    if (
        !session ||
        session.phase === "drawing" ||
        isLoose(session) ||
        !wholeGroupOf(session, ownable)
    )
        return [];
    return session.target.group!.members.map((m) => m.marcherId);
}

/** Whether the session shows a loose path (round 7): copies edited together, no group path */
export const isLoose = (session: PathSession | null): boolean =>
    !!session?.target.group?.loose && !session.target.lane;

/** What Detach and Rejoin act on for the selection now (spec Appendix I.8) */
export function setGroupCommands(
    ownable: readonly number[],
    rejoin: RejoinTarget | null,
): void {
    const s = usePathPenStore.getState();
    if (
        s.ownable.join(",") === ownable.join(",") &&
        JSON.stringify(s.rejoin) === JSON.stringify(rejoin)
    )
        return;
    usePathPenStore.setState({ ownable, rejoin });
}

/** Whether the session's path is drawn on the field now: a selected path always is (AP-O4) */
export const pathShown = (
    session: PathSession | null,
    hidden: boolean,
): session is PathSession =>
    session !== null &&
    (session.phase !== "closed" || session.object || !hidden);

/**
 * Sets the paths Paths All draws as objects. The same objects (by identity: a route's object is
 * kept while its target is) keep the list as it was, so a playhead step that changes no path sets
 * nothing and nothing is drawn again.
 */
export function setPathObjects(objects: readonly PathObject[]): void {
    const now = usePathPenStore.getState().objects;
    if (now.length === objects.length && now.every((o, i) => o === objects[i]))
        return;
    usePathPenStore.setState({ objects });
}

/**
 * The group path objects drawn now (AP-O7): every one but the session's own path, and none while
 * the pen draws or an open shape has the field
 */
export const objectsDrawn = (
    objects: readonly PathObject[],
    session: PathSession | null,
    shapeOpen: boolean,
): readonly PathObject[] =>
    shapeOpen || session?.phase === "drawing"
        ? []
        : objects.filter(
              (o) =>
                  o.target.routeId === null ||
                  o.target.routeId !== session?.target.routeId,
          );

/**
 * The marchers whose path the pen draws now (the one marcher, or every member of the group path),
 * or an empty list. Their start flag positions give way to the pen's line, lanes and ghosts while
 * it shows, as an open shape's marchers' do (#417): otherwise each member's lane is drawn twice
 * over the line being edited (owner, 2026-11-05).
 */
export const pathMarcherIds = (
    session: PathSession | null,
    hidden: boolean,
    /**
     * An open shape has the field (`useShapeFieldModes`), so a closed path isn't drawn and its
     * marchers keep their start flag positions (owner on #683). Under a selected placed box it
     * still is, as the field's underlay (`useShapeFieldModes`)
     */
    closedUnder: boolean,
    /** Paths All's group path objects (step 3a): their members give way to the line and lanes */
    objects: readonly PathObject[] = [],
    /** The selected members of the group path shown (the store's `ownable`) */
    selected: readonly number[] = [],
    /** The selected marchers' own lines drawn (`ownLinesDrawn`): theirs give way too */
    ownLines: readonly OwnLine[] = [],
): readonly number[] => {
    const own =
        !pathShown(session, hidden) ||
        (session.phase === "closed" && closedUnder)
            ? []
            : session.target.trail
              ? // A trail shown closed keeps every member's walked path (its start flag
                // positions' path is the trail as walked); drawn or open, they give way
                session.phase === "closed"
                  ? []
                  : session.target.trail.members.map((m) => m.marcherId)
              : session.target.group
                ? groupLineIds(session, selected)
                : [session.target.marcherId];
    const drawn = objectsDrawn(objects, session, closedUnder).flatMap((o) =>
        o.target.group && drawnAsGroup(o.target)
            ? o.target.group.members.map((m) => m.marcherId)
            : [],
    );
    const lines = ownLines.map((l) => l.target.marcherId);
    return drawn.length === 0 && lines.length === 0
        ? own
        : [...new Set([...own, ...drawn, ...lines])];
};

/**
 * How a group path (not a one-lane copy, not a trail) is drawn now (pathways interaction round 2),
 * or null for any other path:
 *
 * - `drawing`: a new group path being drawn, its line with every member's faint lane.
 * - `selected`: quiet, with some of its marchers selected: only the line each selected marcher
 *   walks, at a shown path's weight, and no group line (testers read the two as "two paths").
 * - `whole`: quiet, with every member selected (interaction round 4, "one line for what you
 *   selected"): the group line alone, deep, the one line to click; only a bent member's lane and
 *   the selected marchers off it keep a faint line of their own.
 * - `edit`: open for editing (Edit group path): the group line, named; of the members' lanes only
 *   the bent ones (round 4: a plain lane is the group line moved over, and many of them hid it).
 * - `adjust`: one member's lane picked (Edit <name>'s line, or a click on its line): that lane
 *   alone, editable.
 */
export type GroupView = "drawing" | "selected" | "whole" | "edit" | "adjust";

/** The spot whose lane is being worked on, picked or in mid-drag, or null */
export function laneFocusOf(s: PathSession): number | null {
    if (s.phase !== "open") return null;
    return s.laneEdit?.marcherId ?? s.lane?.marcherId ?? null;
}

/**
 * Whether `selected` takes in every member of the group path shown, two or more (interaction
 * round 4): the group is selected as a whole, so its one line is what's drawn. Marchers off it
 * selected as well don't change that. One member alone is one marcher, drawn as its own line.
 */
export function wholeGroupOf(
    s: PathSession,
    selected: readonly number[],
): boolean {
    const group = s.target.group;
    if (!group || s.target.lane || s.target.trail || group.members.length < 2)
        return false;
    const on = new Set(selected);
    return group.members.every((m) => on.has(m.marcherId));
}

/**
 * How the session's group path is drawn now (`GroupView`), `selected` being the selected members
 * of it (the store's `ownable`), or null for any other path
 */
export function groupViewOf(
    s: PathSession,
    selected: readonly number[] = [],
): GroupView | null {
    if (!s.target.group || s.target.lane || s.target.trail) return null;
    if (s.phase === "drawing") return "drawing";
    if (s.phase === "closed")
        return wholeGroupOf(s, selected) ? "whole" : "selected";
    return laneFocusOf(s) !== null ? "adjust" : "edit";
}

/**
 * Whose lines a group path session draws (`GroupView`): the selected members and the selected
 * marchers off it while quiet, with the whole group selected every member (the group line is
 * drawn for them) and the detached ones too (a faint line each), the one lane while adjusting,
 * every member otherwise
 */
export function groupLineIds(
    s: PathSession,
    selected: readonly number[],
): number[] {
    const group = s.target.group;
    if (!group) return [];
    const members = group.members.map((m) => m.marcherId);
    const view = groupViewOf(s, selected);
    if (view === "whole")
        return [
            ...new Set([
                ...members,
                ...group.outside.map((m) => m.marcherId),
                ...(group.detachedMembers ?? []).map((m) => m.marcherId),
            ]),
        ];
    if (view === "selected") {
        const on = new Set(members);
        return [
            ...selected.filter((id) => on.has(id)),
            ...group.outside.map((m) => m.marcherId),
        ];
    }
    if (view === "adjust") return [laneFocusOf(s)!];
    return members;
}

/**
 * Sets the selected marchers' own lines (`PathPenState.ownLines`); lines read again the same keep
 * the list, so nothing is drawn again for nothing
 */
export function setOwnLines(lines: readonly OwnLine[]): void {
    const now = usePathPenStore.getState().ownLines;
    if (now.length === 0 && lines.length === 0) return;
    if (JSON.stringify(now) === JSON.stringify(lines)) return;
    usePathPenStore.setState({ ownLines: lines });
}

/** The own lines drawn now: none while the closed path is hidden, the pen draws or a shape is open */
export const ownLinesDrawn = (
    lines: readonly OwnLine[],
    session: PathSession | null,
    hidden: boolean,
    shapeOpen: boolean,
): readonly OwnLine[] => (hidden || shapeOpen || session !== null ? [] : lines);

/** Hides or shows the closed path, as start flag positions' paths level in effect says */
export function setPathHidden(hidden: boolean): void {
    if (usePathPenStore.getState().hidden !== hidden)
        usePathPenStore.setState({ hidden });
}

export const usePathPenStore = create<PathPenState>(() => ({
    hidden: false,
    objects: [],
    ownLines: [],
    openNext: null,
    openRoute: null,
    ownable: [],
    rejoin: null,
    session: null,
    saving: false,
    saved: 0,
}));

/**
 * The move a path is for: the same key is the same marcher's same move, or the same group path
 * in the same move (step 15)
 */
export const pathKey = (
    t: Pick<
        PathTarget,
        | "timelineId"
        | "transitionId"
        | "marcherId"
        | "group"
        | "routeId"
        | "trail"
    >,
) =>
    t.trail
        ? `${t.timelineId}:t${t.routeId ?? "new"}`
        : t.group?.loose
          ? `${t.timelineId}:l${looseIds(t.group)}`
          : t.group
            ? `${t.timelineId}:g${t.routeId ?? "new"}`
            : `${t.timelineId}:${t.transitionId}:${t.marcherId}`;

/** A group's marchers, as a loose path's key has them (its copies change with every edit) */
const looseIds = (g: NonNullable<PathTarget["group"]>) =>
    g.members
        .map((m) => m.marcherId)
        .sort((a, b) => a - b)
        .join(",");

/**
 * Whether `next` is `was` saved as a loose path (round 7): the same marchers in the same move, a
 * group path edited and saved as their own copies, so an open path stays open
 */
const becameLoose = (was: PathTarget, next: PathTarget) =>
    !!next.group?.loose &&
    !!was.group &&
    !was.trail &&
    !was.lane &&
    was.timelineId === next.timelineId &&
    looseIds(was.group) === looseIds(next.group);

/** The same path object: the same route (AP-O1), whoever walks it now */
const sameRoute = (a: PathTarget, b: PathTarget) =>
    a.routeId !== null && a.routeId === b.routeId;

export const pointsOf = (target: PathTarget): PathPoint[] =>
    target.points.map((p) => ({
        id: p.id,
        at: { x: p.at[0], y: p.at[1] },
        ...(p.tension === undefined ? {} : { tension: p.tension }),
        ...(p.bulge === undefined ? {} : { bulge: p.bulge }),
    }));

/** The session's last-leg bulge for `target` as stored (R-14″) */
const toBulgeOf = (target: PathTarget): { toBulge?: number } =>
    target.toBulge === undefined ? {} : { toBulge: target.toBulge };

/** Whether `p` is the route's stored point `i`, in the same place */
const storedAt = (target: PathTarget, i: number, p: PathPoint | undefined) => {
    const q = target.points[i];
    return (
        !!p && !!q && p.id === q.id && p.at.x === q.at[0] && p.at.y === q.at[1]
    );
};

const shapes = new WeakMap<PathSession, PathShape>();

/**
 * The session's path as the handles work on it. Its tangent ends are the ones the route will have
 * once saved (AP-R1): the stored `from` while the first point is the stored first point, in the
 * same place, else where the marcher starts; likewise `to` with the last point.
 */
export function shapeOf(s: PathSession): PathShape {
    let shape = shapes.get(s);
    if (shape) return shape;
    const { target, points } = s;
    // A dragged-out trail ends at its own last point: there are no end spots to enter (R-13″).
    // With Keep end spots it runs on into the tail's end spot, as step 4's trail does (AP-T9);
    // with Ripple in, into the next form's entrance as the drawing shows it now (step 9, RP-4)
    if (s.follow) {
        const entrance =
            s.follow.grabbed !== null && ripplesIn(s.follow)
                ? rippleDrawnPlanOf(s)?.spots[0]
                : undefined;
        const to = entrance
            ? { x: entrance[0], y: entrance[1] }
            : intoEndSpots(s.follow) && s.follow.grabbed !== null
              ? target.to
              : (points.at(-1)?.at ?? target.from);
        shape = {
            from: target.from,
            to,
            points,
            ends: { from: target.from, to },
        };
        shapes.set(s, shape);
        return shape;
    }
    const ends = target.ends;
    const last = target.points.length - 1;
    shape = {
        from: target.drawnEnds?.from ?? target.from,
        to: target.drawnEnds?.to ?? target.to,
        points,
        ...(s.toBulge ? { toBulge: s.toBulge } : {}),
        ends: {
            from:
                ends && last >= 0 && storedAt(target, 0, points[0])
                    ? ends.from
                    : target.from,
            to:
                ends && last >= 0 && storedAt(target, last, points.at(-1))
                    ? ends.to
                    : target.to,
        },
    };
    shapes.set(s, shape);
    return shape;
}

const update = (fn: (s: PathSession) => PathSession) => {
    const { session } = usePathPenStore.getState();
    if (session) usePathPenStore.setState({ session: fn(session) });
};

/**
 * Starts drawing a new path for `target` (the old one stays until Enter replaces it). `object`:
 * drawing the selected path again, which stays the selection. `byRoute`: drawing the selected or
 * the open path again, a path edit by its route (AP-O8); always so for the selected path.
 */
export function startDrawing(
    target: PathTarget,
    drill: string,
    object = false,
    byRoute = object,
): void {
    usePathPenStore.setState({
        session: {
            phase: "drawing",
            target,
            drill,
            points: [],
            pointer: null,
            selected: null,
            dragging: null,
            object,
            byRoute,
        },
    });
}

/**
 * While drawing for the same marchers, the drawing becomes `target`'s kind (a trail, or a group
 * path) and keeps the points placed so far (pathways step 4: Together | Follow on the path bar).
 * False when nothing is being drawn for them, so the caller starts a new drawing.
 */
export function switchDrawing(target: PathTarget, drill: string): boolean {
    const { session } = usePathPenStore.getState();
    if (!session || session.phase !== "drawing" || session.byRoute)
        return false;
    const ids = (t: PathTarget) =>
        (t.trail
            ? t.trail.members.map((m) => m.marcherId)
            : t.group
              ? t.group.members.map((m) => m.marcherId)
              : [t.marcherId]
        )
            .sort((a, b) => a - b)
            .join(",");
    if (ids(session.target) !== ids(target)) return false;
    usePathPenStore.setState({
        session: {
            ...session,
            target,
            drill,
            // A new point's id is given on save; a stored trail's or path's ids aren't these
            points: session.points.map(({ at, tension }) => ({
                at,
                ...(tension === undefined ? {} : { tension }),
            })),
        },
    });
    return true;
}

/** Who walks `target`'s path: a trail's line, a group path's members, or its one marcher */
export const walkersOf = (target: PathTarget): number[] =>
    target.trail
        ? target.trail.members.map((m) => m.marcherId)
        : target.group
          ? target.group.members.map((m) => m.marcherId)
          : [target.marcherId];

/**
 * The marcher selection as the pen reads and writes it: the field's editor's, which writes the
 * app's (the one selection). Marchers are the only selection (interaction system, rule 1): a
 * click on a path's line selects its walkers instead of the path. Tests put their own in.
 */
export interface PathSelectionPort {
    get(): readonly number[];
    set(ids: readonly number[]): void;
}

const fieldSelection: PathSelectionPort = {
    get: () => activeFieldEditor()?.selected() ?? [],
    set: (ids) => activeFieldEditor()?.select(ids),
};
let selectionPort: PathSelectionPort = fieldSelection;

/** Puts in the selection the pen writes (tests); null puts the field's back */
export function setPathSelectionPort(port: PathSelectionPort | null): void {
    selectionPort = port ?? fieldSelection;
}

/**
 * The selection a click (or a right-click) on a path's line makes, as a click on a placed shape's
 * member selects the shape: `walkers` (all of them, or the one marcher whose lane was clicked).
 * The selection is kept when it's already some of them, so a marquee of three, then a click on
 * their line, still acts on those three. Shift adds the walkers. True when the selection changes.
 */
export function selectWalkers(
    walkers: readonly number[],
    {
        add = false,
        keepSubset = true,
    }: { add?: boolean; keepSubset?: boolean } = {},
): boolean {
    const now = selectionPort.get();
    const theirs = new Set(walkers);
    let next: readonly number[];
    if (add) next = [...new Set([...now, ...walkers])];
    else if (keepSubset && now.length > 0 && now.every((id) => theirs.has(id)))
        next = now;
    else next = walkers;
    const same =
        next.length === now.length &&
        [...next].sort((a, b) => a - b).join(",") ===
            [...now].sort((a, b) => a - b).join(",");
    if (same) return false;
    selectionPort.set(next);
    return true;
}

/** Shift-click on a lane: that marcher in or out of the selection. True when it's now in. */
export function toggleWalker(marcherId: number): boolean {
    const now = selectionPort.get();
    const isIn = now.includes(marcherId);
    selectionPort.set(
        isIn ? now.filter((id) => id !== marcherId) : [...now, marcherId],
    );
    return !isIn;
}

/**
 * Makes `target`'s path active (interaction system, rule 2): handles and the full bar, at once,
 * from one click on its line (or Enter). The marchers it's for are selected by the caller; the
 * path read for them again keeps it active (`showPath`, by `openRoute` and its key). `lane`: the
 * member whose lane was clicked, picked on the group path.
 */
export function activatePath(
    target: PathTarget,
    drill: string,
    lane: number | null = null,
    selectionChanges = false,
): void {
    const { session } = usePathPenStore.getState();
    const same =
        session !== null &&
        session.phase !== "drawing" &&
        pathKey(session.target) === pathKey(target);
    const picked =
        lane !== null && target.group && !target.lane
            ? { marcherId: lane, key: null }
            : null;
    usePathPenStore.setState({
        openRoute: selectionChanges ? target.routeId : null,
        session:
            same && session
                ? {
                      ...session,
                      phase: "open",
                      lane: picked ?? (lane === null ? null : session.lane),
                  }
                : {
                      phase: "open",
                      target,
                      drill,
                      points: pointsOf(target),
                      ...toBulgeOf(target),
                      pointer: null,
                      selected: null,
                      dragging: null,
                      object: false,
                      lane: picked,
                  },
    });
}

/**
 * Shows `target`'s path quiet (a right-click or long press on its line, whose walkers the caller
 * selects), so the menu that opens acts on it; the same path already shown stays as it is.
 */
export function focusPath(target: PathTarget, drill: string): void {
    const { session } = usePathPenStore.getState();
    if (
        session !== null &&
        session.phase !== "drawing" &&
        pathKey(session.target) === pathKey(target)
    )
        return;
    usePathPenStore.setState({
        openRoute: null,
        session: {
            phase: "closed",
            target,
            drill,
            points: pointsOf(target),
            ...toBulgeOf(target),
            pointer: null,
            selected: null,
            dragging: null,
            object: false,
        },
    });
}

/**
 * Whose adjustment Reset adjustment takes off (AP-R11; one ladder with Rejoin, interaction
 * system rule 5): the lane picked on the group path, or the one selected member, when it has an
 * adjustment. Null otherwise.
 */
export function resetTargetOf(
    session: PathSession | null,
    ownable: readonly number[],
): number | null {
    if (!session || session.phase === "drawing" || !session.target.group)
        return null;
    if (session.target.lane) return null;
    const lane = session.phase === "open" ? session.lane : null;
    const id = lane
        ? lane.marcherId
        : ownable.length === 1
          ? ownable[0]!
          : null;
    return id !== null && memberOf(session, id)?.adjust ? id : null;
}

/** Edit path's name on a group path (round 3): it edits the line every member follows */
export const editGroupPathLabel = () =>
    tolgee.t("actions.path.editGroup", "Edit group path");

/**
 * Detach's name in ··· and the Path menus (round 6, off the bar): "Detach from group path", with
 * the count when several, "Detach 3 from group path"
 */
export const detachLabel = (count: number) =>
    count > 1
        ? tolgee.t(
              "pathways.editor.detachFromGroupCount",
              "Detach {count} from group path",
              { count },
          )
        : tolgee.t("actions.path.detachFromGroup", "Detach from group path");

/** What Detach does, under its name in the menus (round 6) */
export const detachNote = () =>
    tolgee.t(
        "pathways.editor.detachNote",
        "Stops following group path changes",
    );

/** Detach all's name (round 5): how many marchers it detaches, so its size reads */
export const detachAllLabel = (count: number) =>
    tolgee.t("pathways.editor.detachAllCount", "Detach all {count} marchers", {
        count,
    });

/** What Detach all does, under its name in the menus (round 5) */
export const detachAllNote = () =>
    tolgee.t(
        "pathways.editor.detachAllNote",
        "Ends the group path; each marcher gets their own copy",
    );

/** Edit <name>'s line's name: the marcher's drill number, or no name while it can't act */
export const editLineLabel = (drill: string | null) =>
    drill === null
        ? tolgee.t("actions.path.editLine", "Edit marcher's line")
        : tolgee.t("actions.path.editLineOf", "Edit {marcher}'s line", {
              marcher: drill,
          });

/**
 * Whose line Edit <name>'s line opens (interaction round 3, was Adjust), or why it can't: the one
 * selected member of the group path shown, or the member whose line is being edited. Only that
 * member's line is drawn then, editable, so nobody has to find its faint lane by dragging. One
 * marcher at a time: two members' bends are two separate edits.
 */
export function lineTargetOf(
    session: PathSession | null,
    ownable: readonly number[],
): { marcherId: number; drill: string } | { reason: string } {
    const groupOnly = () =>
        tolgee.t(
            "pathways.editLine.groupOnly",
            "Select a marcher on a group path to edit their line",
        );
    if (!session || session.phase === "drawing" || session.target.trail)
        return { reason: groupOnly() };
    if (!session.target.group)
        return {
            reason: tolgee.t(
                "pathways.editLine.ownPath",
                "This marcher walks its own path: Edit path changes it",
            ),
        };
    if (session.target.lane)
        return {
            reason:
                session.target.lane.detachedFrom != null
                    ? tolgee.t(
                          "pathways.editLine.detached",
                          "This marcher is detached: Edit path changes its own copy, or Rejoin puts it back on the group path",
                      )
                    : tolgee.t(
                          "pathways.editLine.alone",
                          "This marcher is alone on its path: Edit path changes it",
                      ),
        };
    const target = (marcherId: number) => {
        const member = memberOf(session, marcherId);
        return member ? { marcherId, drill: member.drill } : null;
    };
    const lane = session.phase === "open" ? session.lane : null;
    const picked = lane ? target(lane.marcherId) : null;
    if (picked) return picked;
    if (ownable.length > 1)
        return {
            reason: tolgee.t(
                "pathways.editLine.severalSelected",
                "Click one of them again to pick just that marcher, then edit their line",
            ),
        };
    const one = ownable.length === 1 ? target(ownable[0]!) : null;
    if (one) return one;
    return {
        reason: tolgee.t(
            "pathways.editLine.noneSelected",
            "Select a marcher on the group path to edit their line",
        ),
    };
}

/**
 * The path bar's fixed slots (interaction round 2: they stay put, so a press after the selection
 * changes lands where it did): Edit group path (Edit path for a path of one) · Edit <name>'s line ·
 * Match group or Rejoin · More. Detach left the bar for ··· (round 6). Each slot is there for any
 * path but a trail; one that can't act now says why (its tooltip, and the menus' reason). Null
 * reasons where the slot acts, or for a trail (or no path), whose bar has no slot.
 */
export interface PathSlots {
    /** Whether the bar has the member slots at all: any shown path but a trail */
    shown: boolean;
    /** Edit <name>'s line: whose, or why it can't */
    line: { marcherId: number; drill: string } | { reason: string };
    /**
     * The third slot, back to the group (round 6): Rejoin when the selection is detached marchers
     * (Rejoin can act and Detach can't), Match group otherwise. A mixed selection keeps Match group
     * there, Rejoin under ···
     */
    backIsRejoin: boolean;
    /** Why Detach (under ··· and in the menus since round 6) can't act, or null */
    detachReason: string | null;
    /**
     * The members Detach all would detach, with the whole group selected (round 5): Detach is
     * greyed out then, pointing at ··· › Detach all; none otherwise
     */
    detachAll: readonly number[];
    matchReason: string | null;
    /**
     * A loose path (round 7): the third slot is empty, holding its place so the bar doesn't
     * jump; there's no group path to match or rejoin
     */
    loose: boolean;
    /**
     * The marcher's own path, on no group path (sim round 3: Match group stayed after Detach
     * all): the third slot is empty, as a loose path's is
     */
    ownPath: boolean;
}

export function pathSlotsOf(
    session: PathSession | null,
    ownable: readonly number[],
    rejoin: RejoinTarget | null,
): PathSlots {
    const shown =
        session !== null &&
        session.phase !== "drawing" &&
        !session.target.trail;
    const detachIds = detachIdsOf(ownable, session);
    const loose = isLoose(session);
    const backIsRejoin = !loose && rejoin !== null && detachIds.length === 0;
    const notGroup =
        !session?.target.group || session.target.lane
            ? session?.target.lane?.detachedFrom != null
                ? tolgee.t(
                      "pathways.slots.detached",
                      "This marcher is detached: Rejoin puts it back on the group path",
                  )
                : tolgee.t(
                      "pathways.slots.ownPath",
                      "This marcher walks its own path, not a group path",
                  )
            : null;
    const detachAll = shown ? detachAllIdsOf(ownable, session) : [];
    const detachReason = loose
        ? null
        : detachAll.length > 0
          ? tolgee.t(
                "pathways.slots.detachWhole",
                "Select some marchers to detach them. To detach everyone, use ··· › Detach all {count} marchers",
                { count: detachAll.length },
            )
          : !shown || detachIds.length > 0 || backIsRejoin
            ? null
            : (notGroup ??
              tolgee.t(
                  "pathways.slots.detachNone",
                  "Select marchers on the group path to detach them",
              ));
    const resetId = resetTargetOf(session, ownable);
    const lanePicked = session?.phase === "open" && !!session.lane;
    const matchReason =
        !shown || resetId !== null || loose
            ? null
            : (notGroup ??
              (!lanePicked && ownable.length > 1
                  ? tolgee.t(
                        "pathways.slots.matchSeveral",
                        "Click one of them again to pick just that marcher, then match it to the group path",
                    )
                  : !lanePicked && ownable.length === 0
                    ? tolgee.t(
                          "pathways.slots.matchNone",
                          "Select a marcher on the group path",
                      )
                    : tolgee.t(
                          "pathways.slots.matches",
                          "This marcher already walks the group path exactly: nothing to match",
                      )));
    const ownPath =
        shown &&
        (!session.target.group || !!session.target.lane) &&
        session.target.lane?.detachedFrom == null;
    return {
        shown,
        line: lineTargetOf(session, ownable),
        ownPath,
        backIsRejoin,
        detachReason,
        detachAll,
        matchReason,
        loose,
    };
}

/**
 * Edit <name>'s line (interaction round 3, was Adjust): `marcherId`'s lane of the group path shown
 * is the only line drawn and the only one editable, its bend handles shown at once; the path is
 * active, as Edit path makes it. Escape, or a click on empty field, leaves it.
 */
export function editMemberLine(marcherId: number): void {
    const { session } = usePathPenStore.getState();
    if (
        !session ||
        session.phase === "drawing" ||
        !memberOf(session, marcherId) ||
        session.target.lane
    )
        return;
    if (
        session.phase === "open" &&
        session.lane?.marcherId === marcherId &&
        !session.lane.keyGone
    )
        return;
    usePathPenStore.setState({
        session: {
            ...session,
            phase: "open",
            selected: null,
            lane: { marcherId, key: null },
        },
    });
}

/**
 * Shows `target`'s stored path on the field, closed, or refreshes it after a save or a move of the
 * playhead. A path already open for the same move stays open, keeping its selected point.
 */
/**
 * The picked lane on the path as read again. A stored key index shifts when a key is added before
 * it, so the picked key is followed by its anchor; a drag changes only its displacement.
 */
function laneAfterRead(
    session: PathSession,
    target: PathTarget,
): PathSession["lane"] {
    const lane = session.lane;
    if (!lane || !target.group) return null;
    const member = target.group.members.find(
        (m) => m.marcherId === lane.marcherId,
    );
    if (!member) return null;
    if (lane.key === null) return lane;
    const was = session.target.group?.members.find(
        (m) => m.marcherId === lane.marcherId,
    )?.adjust?.keys[lane.key];
    const key = was
        ? (member.adjust?.keys.findIndex(
              (k) => k.a === was.a && k.b === was.b && k.f === was.f,
          ) ?? -1)
        : -1;
    return key >= 0
        ? { marcherId: lane.marcherId, key }
        : { marcherId: lane.marcherId, key: null, keyGone: true };
}

export function showPath(
    target: PathTarget,
    drill: string,
    object = false,
): void {
    const { session } = usePathPenStore.getState();
    const points = pointsOf(target);
    const { openNext } = usePathPenStore.getState();
    // A Detached copy is shown on its lane (`target.lane`), its marcher its one member
    const next =
        openNext !== null &&
        (target.lane
            ? (target.group?.members.some((m) => m.marcherId === openNext) ??
              false)
            : !target.group && target.marcherId === openNext);
    if (next) usePathPenStore.setState({ openNext: null });
    // Made active by a click on its line, which selected its walkers (`activatePath`)
    const { openRoute } = usePathPenStore.getState();
    const activated = openRoute !== null && target.routeId === openRoute;
    if (openRoute !== null) usePathPenStore.setState({ openRoute: null });
    // A path object is the same path while it's the same route (AP-O1)
    const same =
        session !== null &&
        (object
            ? session.object && sameRoute(session.target, target)
            : !session.object &&
              (pathKey(session.target) === pathKey(target) ||
                  becameLoose(session.target, target)));
    const open = next || activated || (session?.phase === "open" && same);
    const kept =
        open && session && session.selected !== null
            ? Number(session.selected.slice(1)) < points.length
                ? session.selected
                : null
            : null;
    usePathPenStore.setState({
        session: {
            phase: open ? "open" : "closed",
            target,
            drill,
            points,
            ...toBulgeOf(target),
            pointer: null,
            selected: kept,
            dragging: null,
            object,
            lane:
                open && session && same ? laneAfterRead(session, target) : null,
        },
    });
}

/**
 * Opens the path shown for editing (Edit path, Enter); false when none is. Adjusting one lane of a
 * group path, it lets the lane go, so the group path itself is edited (interaction round 2: the
 * group line shows only then).
 */
export function openPath(): boolean {
    const { session } = usePathPenStore.getState();
    if (!session || session.phase === "drawing") return false;
    if (session.phase === "closed" || session.lane)
        usePathPenStore.setState({
            session: { ...session, phase: "open", selected: null, lane: null },
        });
    return true;
}

/**
 * Closes the open path (Escape), leaving it drawn, or cancels a drawing: the path it would have
 * replaced, if any, is shown again.
 */
export function closePath(): void {
    const { session } = usePathPenStore.getState();
    if (!session || session.phase === "closed") return;
    if (session.phase === "drawing" && session.target.routeId === null) {
        clearPath();
        return;
    }
    usePathPenStore.setState({
        session: {
            ...session,
            phase: "closed",
            points:
                session.phase === "drawing"
                    ? pointsOf(session.target)
                    : session.points,
            ...(session.phase === "drawing"
                ? { toBulge: session.target.toBulge }
                : {}),
            pointer: null,
            selected: null,
            dragging: null,
            lane: null,
        },
    });
}

/** Takes the path off the field: no marcher with a path selected, or playback. */
export function clearPath(): void {
    const { session, openRoute } = usePathPenStore.getState();
    if (session || openRoute !== null)
        usePathPenStore.setState({ session: null, openRoute: null });
}

export const isDrawing = () =>
    usePathPenStore.getState().session?.phase === "drawing";

/** While drawing, a corner placed at `at` */
export function addPoint(at: XY): void {
    update((s) => ({ ...s, points: [...s.points, { at }] }));
}

/**
 * While drawing, the points as a press-and-drag has them: the point just placed smooth (or a corner
 * again), shown with its tangent bar until the release (`endNewPoint`)
 */
export function shapeNewPoint(points: readonly PathPoint[]): void {
    update((s) => ({ ...s, points, dragging: points.length - 1 }));
}

/** The press-and-drag that shaped the point just placed is let go */
export function endNewPoint(): void {
    update((s) => (s.dragging === null ? s : { ...s, dragging: null }));
}

/** Takes the last point back while drawing; false when not drawing. */
export function removeLastPoint(): boolean {
    const { session } = usePathPenStore.getState();
    if (!session || session.phase !== "drawing") return false;
    if (session.points.length > 0)
        update((s) => ({
            ...s,
            points: s.points.slice(0, -1),
            dragging: null,
        }));
    return true;
}

export function setPointer(pointer: XY | null): void {
    const { session } = usePathPenStore.getState();
    const was = session?.pointer ?? null;
    if (
        was === pointer ||
        (was && pointer && was.x === pointer.x && was.y === pointer.y)
    )
        return;
    update((s) => ({ ...s, pointer }));
}

export function selectPoint(key: string | null): void {
    update((s) =>
        s.selected === key && (key === null || !s.lane)
            ? s
            : { ...s, selected: key, lane: key === null ? s.lane : null },
    );
}

/** Picks a lane (and maybe one of its keys) on the open group path, or lets it go */
export function selectLane(
    lane: { marcherId: number; key: number | null } | null,
): void {
    update((s) =>
        s.lane?.marcherId === lane?.marcherId &&
        s.lane?.key === lane?.key &&
        !s.lane?.keyGone
            ? s
            : { ...s, lane, selected: lane ? null : s.selected },
    );
}

/** How far the pointer runs along a lane (field px) before its note moves to follow it */
const HOVER_TIP_FOLLOW = 24;

/** The lane under the pointer, or none */
export function setHoverLane(
    hoverLane: { marcherId: number; at: XY; stacked?: number } | null,
): void {
    const was = usePathPenStore.getState().session?.hoverLane ?? null;
    if (
        was?.marcherId === hoverLane?.marcherId &&
        was?.stacked === hoverLane?.stacked &&
        (!was ||
            !hoverLane ||
            Math.hypot(was.at.x - hoverLane.at.x, was.at.y - hoverLane.at.y) <
                HOVER_TIP_FOLLOW)
    )
        return;
    update((s) => ({ ...s, hoverLane }));
}

/** The Adjust a lane or key drag would write, shown live; null ends the preview */
export function setLaneEdit(laneEdit: PathSession["laneEdit"] | null): void {
    update((s) => ({ ...s, laneEdit }));
}

/** A group member as drawn now: a lane being dragged shows the Adjust it would have */
export function memberNow(s: PathSession, m: GroupMember): GroupMember {
    return s.laneEdit?.marcherId === m.marcherId
        ? { ...m, adjust: s.laneEdit.adjust }
        : m;
}

/** The member `marcherId` of the session's group path, or undefined */
export const memberOf = (s: PathSession, marcherId: number) =>
    s.target.group?.members.find((m) => m.marcherId === marcherId);

/** The points as a drag has them, shown live and saved on release ({@link commitPoints}) */
/**
 * `toBulge` as a session edit: a number sets the last leg's bulge, null makes it straight, and
 * undefined keeps it
 */
const withToBulge = (
    s: PathSession,
    toBulge: number | null | undefined,
): PathSession => {
    if (toBulge === undefined) return s;
    const { toBulge: _was, ...rest } = s;
    return toBulge === null || toBulge === 0 ? rest : { ...rest, toBulge };
};

export function dragPoints(
    points: readonly PathPoint[],
    index: number,
    toBulge?: number | null,
): void {
    update((s) => withToBulge({ ...s, dragging: index, points }, toBulge));
}

/** A drag that was lost puts the points back. */
export function cancelDrag(
    before: readonly PathPoint[],
    toBulgeBefore?: number | null,
): void {
    update((s) =>
        withToBulge({ ...s, dragging: null, points: before }, toBulgeBefore),
    );
}

/**
 * The points as they are written: a point's id when stored, roundness and arc bulge when it has
 * them (a preview reads the same)
 */
export const storedPoints = (points: readonly PathPoint[]): RoutePointInput[] =>
    points.map((c) => ({
        ...(c.id === undefined ? {} : { id: c.id }),
        at: [c.at.x, c.at.y] as [number, number],
        ...((c.tension ?? 0) > 0 ? { tension: c.tension } : {}),
        ...(c.bulge ? { bulge: c.bulge } : {}),
    }));

/**
 * The Follow tool's write (step 4b, step 9): Ripple in (AP-T12) into the form the end spots make,
 * dealt in trail order; else the drag (AP-T8) or onto the spots they have (AP-T9)
 */
async function saveFollow(
    follow: FollowDrag,
    leaderId: number,
    points: RoutePointInput[],
    session: PathSession,
    enter: number | null,
): Promise<void> {
    if (ripplesIn(follow))
        await rippleTrail({
            db,
            window: follow.window,
            marcherIds: follow.ids,
            leaderId,
            points,
            keepMove: follow.keep?.timelineId ?? null,
            enter,
        });
    else
        await dragTrail({
            db,
            window: follow.window,
            marcherIds: follow.ids,
            leaderId,
            points,
            spacing: followSpacingOf(session),
            step: follow.step,
            ends: follow.ends === "keep" ? "keep" : "trail",
            keepMove: follow.keep?.timelineId ?? null,
        });
    invalidatePlacedBoxes();
}

/**
 * Whether a group path's marchers are a placed shape (round 7): its walkers, with any marchers
 * Detached from it, are exactly one placed shape's members at the playhead or at the move's start
 * or end. Only then does it stay one live group path; any other is saved as their own copies.
 */
function formsShape(target: PathTarget): boolean {
    const group = target.group;
    if (!group) return false;
    const ids = new Set([
        ...group.members.map((m) => m.marcherId),
        ...(group.detachedMembers ?? []).map((m) => m.marcherId),
    ]);
    const beats = [
        useTimelineSelectionStore.getState().playheadBeat,
        target.start,
        target.end,
    ];
    return beats.some((beat) =>
        placedBoxesAt(beat).some(
            (box) =>
                box.recipe.members.length === ids.size &&
                box.recipe.members.every((m) => ids.has(m.marcherId)),
        ),
    );
}

/**
 * Whether a write on `target` keeps it one live group path (review of #900): a loose path's edits
 * (point edits, Re-fit, acknowledge) stay loose even when its marchers have since become a placed
 * shape, so nothing re-links them silently; only a new drawing (`fresh`: drawn again, or the pen
 * with the marchers selected) on exactly a placed shape's members makes a live group path, the
 * way back to linking for marchers grouped later. Any other group path stays live only while its
 * marchers are a placed shape (round 7).
 */
export const keepsLiveFor = (
    loose: boolean,
    fresh: boolean,
    isShape: () => boolean,
): boolean => (loose && !fresh ? false : isShape());

const keepsLive = (target: PathTarget, fresh: boolean): boolean =>
    keepsLiveFor(!!target.group?.loose, fresh, () => formsShape(target));

/** Each member's transition on the path shown, so a write takes the lane meant (review of #900) */
const transitionsOf = (target: PathTarget): Record<number, number> =>
    Object.fromEntries(
        target.group!.members.map((m) => [m.marcherId, m.transitionId]),
    );

/**
 * A write on the session's group path (round 7): one undo step that edits it and, unless it keeps
 * one live group path (`keepsLive`), leaves each marcher on its own copy (`writeGroupPath`). The
 * first time a path is saved that way, a toast says so and how to keep the marchers linked; when
 * marchers sharing a spot keep it live, a toast names them.
 */
async function groupWrite<R>(
    target: PathTarget,
    name: string,
    edit: GroupEdit<R>,
    keepLive = keepsLive(target, !!edit.draw),
): Promise<GroupWrite<R>> {
    const marcherIds = target.group!.members.map((m) => m.marcherId);
    const done = await writeGroupPath<R>({
        db,
        name,
        timelineId: target.timelineId,
        marcherIds,
        keepLive,
        transitions: transitionsOf(target),
        ...edit,
    });
    if (done.shared.length > 0)
        toast.info(
            tolgee.t(
                "pathways.toasts.keptLive",
                "Kept as one group path: {names} share a spot, so they can't each have their own",
                { names: joinList(done.shared) },
            ),
            { id: "path-kept-live" },
        );
    // Saved as separate copies says nothing (sim round 3: a toast saying so contradicted the
    // marchers editing together); the label says "4 paths"
    return done;
}

/** Whether `target` is a group path written by `groupWrite`: not a trail or one marcher's copy */
const isGroupWrite = (target: PathTarget) =>
    !!target.group && !target.trail && !target.lane;

/**
 * `save` on a group path (round 7, `groupWrite`): point edits on the open path move every lane
 * (AP-R1), the path drawn again keeps its id (AP-O8), or the pen with several marchers draws one
 * (AP-R8); saved as each marcher's own copy unless its marchers are a placed shape.
 */
async function saveGroupPath(
    session: PathSession,
    stored: RoutePointInput[],
    drag: boolean,
    toBulge: number | null,
): Promise<void> {
    const { target } = session;
    const routeId = target.routeId;
    if (session.phase === "open" && routeId !== null) {
        const { result } = await groupWrite(target, "editPathPoints", {
            edit: (tx, rid) =>
                editPathPointsInTransaction({
                    tx,
                    routeId: rid,
                    points: stored,
                    drag,
                    toBulge,
                }),
        });
        reportRehome(result);
        return;
    }
    if (session.byRoute && routeId !== null) {
        // Drawn again: a fresh drawing, live when its marchers are exactly a placed shape
        const { result } = await groupWrite(
            target,
            "redrawPath",
            {
                edit: (tx, rid) =>
                    redrawPathInTransaction({
                        tx,
                        routeId: rid,
                        points: stored,
                    }),
            },
            keepsLive(target, true),
        );
        reportRehome(result);
        return;
    }
    const marcherIds = target.group!.members.map((m) => m.marcherId);
    const { result: drawn } = await groupWrite(target, "drawGroupRoute", {
        draw: true,
        edit: (tx) =>
            drawGroupRouteInTransaction({
                tx,
                timelineId: target.timelineId,
                marcherIds,
                points: stored,
            }),
        routeOf: (r) => r.routeId,
    });
    reportRehome(drawn.rehome);
    reportAdjustsRemoved(drawn.adjustsRemoved);
}

/** Writes `points` as the session's path (AP-R1), smooth ones with their roundness. */
async function save(
    points: readonly PathPoint[],
    drag = false,
    /** Ripple in: the marcher whose spot the finish was on, which the line enters (RP-4) */
    enter: number | null = null,
): Promise<boolean> {
    const { session, saving } = usePathPenStore.getState();
    if (!session || saving) return false;
    usePathPenStore.setState({ saving: true });
    const stored = storedPoints(points);
    // The last leg's bulge goes with a point edit of the open path (R-14″); a drawing has none
    const toBulge = session.phase === "open" ? (session.toBulge ?? null) : null;
    const { target } = session;
    const { follow } = session;
    try {
        if (follow && follow.grabbed !== null)
            await saveFollow(follow, follow.grabbed, stored, session, enter);
        else if (target.trail && target.routeId !== null)
            // Point edits on an open trail, or the trail drawn again (AP-T2): by its route, so a
            // member taken over at the move's start doesn't stop it
            await editTrailPoints({
                db,
                routeId: target.routeId,
                points: stored,
                toBulge,
            });
        else if (target.trail)
            // Follow: the line gets its trail (AP-T1)
            await followTrail({
                db,
                timelineId: target.timelineId,
                marcherIds: target.trail.members.map((m) => m.marcherId),
                points: stored,
            });
        else if (isGroupWrite(target))
            await saveGroupPath(session, stored, drag, toBulge);
        else if (session.phase === "open" && target.routeId !== null)
            // Point edits on the open path are path edits, by its route (AP-O8, 07 N3)
            reportRehome(
                await editPathPoints({
                    db,
                    routeId: target.routeId,
                    points: stored,
                    drag,
                    toBulge,
                }),
            );
        else if (session.byRoute && target.routeId !== null)
            // The selected or open path drawn again: a path edit too, keeping its id (AP-O8)
            reportRehome(
                await redrawPath({
                    db,
                    routeId: target.routeId,
                    points: stored,
                }),
            );
        else if (target.group)
            // The pen with several marchers: a group path (AP-R8)
            await saveGroupPath(session, stored, drag, toBulge);
        else {
            const drawn = await drawRoute({
                db,
                timelineId: target.timelineId,
                marcherId: target.marcherId,
                points: stored,
            });
            reportRehome(drawn.rehome);
            reportAdjustsRemoved(drawn.adjustRemoved ? 1 : 0);
        }
        return true;
    } catch (error) {
        toastTimelineError(
            error,
            tolgee.t("pathways.errors.save", "Couldn't save the path"),
        );
        return false;
    } finally {
        usePathPenStore.setState({ saving: false });
    }
}

/**
 * Enter, a double-click or a click on the last point: the path drawn so far becomes the marcher's
 * (AP-R1). With no point placed it's the same as Escape, as a Line with too few points is. The
 * path is left shown and closed, read again once the timeline has it (`usePathPen`).
 */
export async function finishDrawing(
    /** Ripple in: the marcher whose spot the finish was on (RP-4) */
    enter: number | null = null,
): Promise<void> {
    const { session } = usePathPenStore.getState();
    if (!session || session.phase !== "drawing") return;
    // Into end spots (Keep end spots, Ripple in) the trail may run straight in (RP-6)
    const straightIn =
        !!session.follow &&
        session.follow.grabbed !== null &&
        intoEndSpots(session.follow);
    if (session.points.length === 0 && !straightIn) {
        closePath();
        return;
    }
    // Ripple in finished with no end named (Enter, Finish, a double-click): the entrance the
    // drawing shows now, the pointer counted as it's shown, so what's written is what's seen
    // (RP-4, step 9 review)
    const shown =
        enter === null && session.follow && ripplesIn(session.follow)
            ? (rippleDrawnPlanOf(session)?.entrance ?? null)
            : enter;
    const ok = await save(session.points, false, shown);
    // A trail dragged out (step 4b): the stored trail is read again and shown as any trail is
    if (ok && session.follow) {
        usePathPenStore.setState((state) => ({
            session: null,
            saved: state.saved + 1,
        }));
        return;
    }
    if (ok)
        usePathPenStore.setState((state) => ({
            session: {
                ...session,
                phase: "closed",
                pointer: null,
                dragging: null,
            },
            saved: state.saved + 1,
        }));
    else closePath();
}

/**
 * The open path's points changed by a drag, a click on a midpoint or a menu: saved with every
 * point's id (AP-R1), one undo step, the points as they were when it fails. `selected` is the
 * point selected after it, when that changes.
 */
export async function commitPoints(
    points: readonly PathPoint[],
    before: readonly PathPoint[],
    selected?: string | null,
    drag = false,
    /** The last leg's bulge now and before (R-14″): a number, null for none, undefined to keep */
    toBulge?: { now: number | null; before: number | null },
): Promise<void> {
    const { session } = usePathPenStore.getState();
    if (!session || session.phase !== "open") return;
    update((s) =>
        withToBulge(
            {
                ...s,
                dragging: null,
                points,
                ...(selected === undefined ? {} : { selected }),
            },
            toBulge?.now,
        ),
    );
    if (await save(points, drag))
        usePathPenStore.setState((state) => ({ saved: state.saved + 1 }));
    else cancelDrag(before, toBulge?.before);
}

/**
 * The open path becomes `next` (a menu's pick, an arc's bulge): its points and its last leg's
 * bulge, one undo step (AP-R1, AP-T11)
 */
export async function commitShape(
    next: PathShape,
    selected?: string | null,
    drag = false,
): Promise<void> {
    const { session } = usePathPenStore.getState();
    if (!session || session.phase !== "open") return;
    await commitPoints(next.points, session.points, selected, drag, {
        now: next.toBulge ?? null,
        before: session.toBulge ?? null,
    });
}

/** A new point in the middle of leg `leg` of the open path, selected (a Line's Add point here) */
export async function insertPoint(leg: number): Promise<void> {
    const { session } = usePathPenStore.getState();
    if (!session || session.phase !== "open") return;
    await commitShape(splitLeg(shapeOf(session), leg), pointKey(leg));
}

/**
 * Deletes point `index`. On the open path that's AP-R1 without it, one undo step; its last point
 * removes the path instead (AP-R2), so no path with no point is left behind. While drawing, the
 * point just goes.
 */
export async function deletePoint(
    index: number,
    { selectNeighbor = false }: { selectNeighbor?: boolean } = {},
): Promise<void> {
    const { session } = usePathPenStore.getState();
    if (!session || !session.points[index]) return;
    const shape = withoutPoint(shapeOf(session), index);
    const { points } = shape;
    if (session.phase === "drawing") {
        update((s) => ({ ...s, selected: null, points }));
        return;
    }
    if (points.length === 0) {
        await removePath();
        return;
    }
    // From the keyboard, the point before it is selected next (the first, when it was the first),
    // so pressing on deletes point after point, and only the last removes the path
    await commitShape(
        shape,
        selectNeighbor ? pointKey(Math.max(0, index - 1)) : null,
    );
}

/**
 * Point `index` of the open path made a corner, or smooth at the plain roundness (Corner | Smooth,
 * a double-click, the editor bar): one undo step; nothing when it already is. Smooth selects it,
 * so its tangent bar shows, as a Line's Smooth does.
 */
export async function setPointSmooth(
    index: number,
    smooth: boolean,
): Promise<void> {
    const { session } = usePathPenStore.getState();
    if (!session || session.phase !== "open" || !session.points[index]) return;
    const shape = shapeOf(session);
    if (isSmooth(shape, index) === smooth) {
        if (smooth) selectPoint(pointKey(index));
        return;
    }
    // R-14″: a point at an end of an arc leg stays a corner; Smooth says why
    if (smooth && besideArc(shape, index)) {
        toast.info(besideArcReason());
        return;
    }
    await commitPoints(
        withTension(shape, index, smooth ? SMOOTH : 0),
        session.points,
        smooth ? pointKey(index) : undefined,
    );
}

/** How long the Remove path toast with Undo stays, unless the next history change closes it */
const TOAST_MS = 8000;

/** A success toast with Undo that closes on the next history change, as split and merge's do */
function toastWithUndo(message: string): void {
    let unsubscribe = () => {};
    const id = toast.success(message, {
        duration: TOAST_MS,
        action: {
            label: tolgee.t("actions.edit.undo", "Undo"),
            onClick: () => runAction("performUndo"),
        },
        onDismiss: () => unsubscribe(),
        onAutoClose: () => unsubscribe(),
    });
    unsubscribe = subscribeHistoryChanges(() => {
        unsubscribe();
        toast.dismiss(id);
    });
}

/**
 * AP-H1's promise: an Adjust is never moved or dropped silently. Says what a path edit did to the
 * Adjusts on it, with Undo; nothing when it did nothing.
 */
export function reportRehome(report: RehomeReport): void {
    const parts: string[] = [];
    if (report.rehomedSpots > 0)
        parts.push(
            tolgee.t(
                "pathways.toasts.rehomed",
                "Moved the bend on {count, plural, one {# line} other {# lines}} to the nearest points left",
                { count: report.rehomedSpots },
            ),
        );
    if (report.droppedKeys > 0 && report.clearedSpots === 0)
        parts.push(
            tolgee.t(
                "pathways.toasts.rehomedKeys",
                "{count, plural, one {# bend point} other {# bend points}} dropped",
                { count: report.droppedKeys },
            ),
        );
    if (report.clearedSpots > 0)
        parts.push(
            tolgee.t(
                "pathways.toasts.rehomedCleared",
                "{count, plural, one {# line lost its bend} other {# lines lost their bends}}",
                { count: report.clearedSpots },
            ),
        );
    if (parts.length > 0) toastWithUndo(parts.join(" · "));
}

/** AP-R8's and AP-R1's toast: a new path took the place of one a spot had an Adjust on */
function reportAdjustsRemoved(count: number): void {
    if (count > 0)
        toastWithUndo(
            tolgee.t(
                "pathways.toasts.adjustsRemoved",
                "{count, plural, one {# bend} other {# bends}} removed: {count, plural, one {it was} other {they were}} on the old path",
                { count },
            ),
        );
}

/** Runs one Adjust or Re-fit write: one at a time, the path read again after it */
async function adjustWrite(
    fallback: () => string,
    write: () => Promise<void>,
): Promise<boolean> {
    if (usePathPenStore.getState().saving) return false;
    usePathPenStore.setState({ saving: true });
    try {
        await write();
        usePathPenStore.setState((state) => ({ saved: state.saved + 1 }));
        return true;
    } catch (error) {
        toastTimelineError(error, fallback());
        return false;
    } finally {
        usePathPenStore.setState({ saving: false });
    }
}

const adjustFallback = () =>
    tolgee.t("pathways.errors.adjust", "Couldn't bend this line");

/** Reads the lane of a marcher on the session's group path, for an Adjust write */
const laneArgs = (marcherId: number) => {
    const { session } = usePathPenStore.getState();
    const member = session ? memberOf(session, marcherId) : undefined;
    return member?.laneId === undefined
        ? null
        : { db, laneId: member.laneId, marcherId };
};

/** AP-R11, decision C: the lane of `marcherId` is displaced by `d` at place `x`. One undo step. */
export async function commitLaneAdjust(
    marcherId: number,
    x: number,
    d: [number, number],
): Promise<void> {
    const args = laneArgs(marcherId);
    // On success the preview stays until the path is read again (`showPath`), so the bend doesn't
    // flash away for a frame between the save and the read
    if (
        !args ||
        !(await adjustWrite(adjustFallback, () =>
            adjustLane({ ...args, x, d }),
        ))
    )
        setLaneEdit(null);
}

/** A key handle dragged: key `index` of the lane takes displacement `d`. One undo step. */
export async function commitAdjustKey(
    marcherId: number,
    index: number,
    d: [number, number],
): Promise<void> {
    const args = laneArgs(marcherId);
    if (
        !args ||
        !(await adjustWrite(adjustFallback, () =>
            setAdjustKey({ ...args, index, d }),
        ))
    )
        setLaneEdit(null);
}

/** Removes the key `index` of the lane. One undo step. */
export async function deleteAdjustKey(
    marcherId: number,
    index: number,
): Promise<void> {
    const args = laneArgs(marcherId);
    // Nothing went (a save in flight, or a refusal): the key stays picked
    if (
        !args ||
        !(await adjustWrite(adjustFallback, () =>
            removeAdjustKey({ ...args, index }),
        ))
    )
        return;
    // The lane stays picked with its key gone, so the next Delete can't fall through to Remove
    // path or wipe the lane's other keys
    update((s) =>
        s.lane?.marcherId === marcherId
            ? { ...s, lane: { marcherId, key: null, keyGone: true } }
            : s,
    );
}

/** AP-R11's reset: the spot walks the plain lane again. One undo step. */
export async function resetSpot(marcherId: number): Promise<void> {
    const { session } = usePathPenStore.getState();
    // A plain lane has nothing to reset: no write, so no undo step that changes nothing
    if (!session || !memberOf(session, marcherId)?.adjust) return;
    const args = laneArgs(marcherId);
    if (args) await adjustWrite(adjustFallback, () => resetLaneAdjust(args));
    update((s) =>
        s.lane?.marcherId === marcherId
            ? { ...s, lane: { marcherId, key: null } }
            : s,
    );
}

/**
 * Delete with a lane picked: its picked key goes, or the spot resets. Never the path, and nothing
 * when the picked key has just gone.
 */
export async function deleteOnLane(
    lane: NonNullable<PathSession["lane"]>,
): Promise<void> {
    if (lane.key !== null) await deleteAdjustKey(lane.marcherId, lane.key);
    else if (!lane.keyGone) await resetSpot(lane.marcherId);
}

/** Re-fit (decision A), by the session's route. One undo step. */
export async function refitOpenPath(): Promise<void> {
    const target = usePathPenStore.getState().session?.target;
    const routeId = target?.routeId ?? null;
    if (!target || routeId === null) return;
    await adjustWrite(
        () => tolgee.t("pathways.errors.refit", "Couldn't re-fit the path"),
        async () =>
            reportRehome(
                isGroupWrite(target)
                    ? (
                          await groupWrite(target, "refitPath", {
                              edit: (tx, rid) =>
                                  refitPathInTransaction({ tx, routeId: rid }),
                          })
                      ).result
                    : await refitRoute({ db, routeId }),
            ),
    );
}

/** Takes the re-homed badge off the session's path. One undo step. */
export async function acknowledgeOpenPath(): Promise<void> {
    const target = usePathPenStore.getState().session?.target;
    const routeId = target?.routeId ?? null;
    if (!target || routeId === null) return;
    await adjustWrite(adjustFallback, async () => {
        if (isGroupWrite(target))
            await groupWrite(target, "acknowledgeRehomed", {
                edit: (tx, rid) =>
                    acknowledgeRehomedInTransaction({ tx, routeId: rid }),
            });
        else await acknowledgeRehomed({ db, routeId });
    });
}

/**
 * Remove path (AP-R2), open or closed: the move goes straight again, one undo step. On a group
 * path the whole group's path goes, and the toast says for how many marchers (step 15).
 */
export async function removePath(): Promise<void> {
    const { session, saving } = usePathPenStore.getState();
    if (
        !session ||
        session.phase === "drawing" ||
        saving ||
        session.target.routeId === null
    )
        return;
    usePathPenStore.setState({ saving: true });
    try {
        if (session.target.trail) {
            // Remove trail (AP-T4): the line walks straight to the same end spots
            const gone = await removeTrail({
                db,
                routeId: session.target.routeId,
            });
            clearPath();
            toastWithUndo(
                tolgee.t(
                    "pathways.toasts.removedTrail",
                    "Removed the trail: {count, plural, one {# marcher walks} other {# marchers walk}} straight to the same end spots",
                    { count: gone.marcherIds.length },
                ),
            );
            return;
        }
        const { target } = session;
        const routeId = session.target.routeId;
        // A loose path's copies regroup first, so its marchers' paths all go in one step (round 7)
        const { marcherIds } = isGroupWrite(target)
            ? (
                  await groupWrite(
                      target,
                      "removeRoute",
                      {
                          edit: (tx, rid) =>
                              removeRouteInTransaction({ tx, routeId: rid }),
                      },
                      // The route goes: nothing is left to link or Detach
                      true,
                  )
              ).result
            : await removeRoute({ db, routeId });
        clearPath();
        if (!session.target.group)
            toastWithUndo(tolgee.t("pathways.toasts.removed", "Path removed"));
        else
            toastWithUndo(
                tolgee.t(
                    "pathways.toasts.removedGroup",
                    "Removed the path for {count, plural, one {# marcher} other {# marchers}}",
                    { count: marcherIds.length },
                ),
            );
    } catch (error) {
        toastTimelineError(
            error,
            tolgee.t("pathways.errors.remove", "Couldn't remove the path"),
        );
    } finally {
        usePathPenStore.setState({ saving: false });
    }
}

/**
 * Reverse (AP-T3, pathways step 4): the other end of the shown trail's line leads, one undo step.
 * Everyone keeps their end spot; the trail is read again and stays as it was shown (open or not).
 */
export async function reverseShownTrail(): Promise<void> {
    const { session, saving } = usePathPenStore.getState();
    if (
        !session?.target.trail ||
        session.phase === "drawing" ||
        saving ||
        session.target.routeId === null
    )
        return;
    usePathPenStore.setState({ saving: true });
    try {
        const { leaderId } = await reverseTrail({
            db,
            routeId: session.target.routeId,
        });
        const leader = session.target.trail.members.find(
            (m) => m.marcherId === leaderId,
        );
        usePathPenStore.setState((state) => ({ saved: state.saved + 1 }));
        if (leader)
            toastWithUndo(
                tolgee.t("pathways.toasts.reversed", "{marcher} leads now", {
                    marcher: leader.drill,
                }),
            );
    } catch (error) {
        toastTimelineError(
            error,
            tolgee.t("pathways.errors.reverse", "Couldn't reverse the trail"),
        );
    } finally {
        usePathPenStore.setState({ saving: false });
    }
}

/**
 * Detach (AP-R9, step 3c): the selected marchers on the shown group path each get a verbatim copy
 * of it, keeping their offset and Adjust, so nobody moves; one undo step however many. With one
 * marcher, its copy is then shown, open (the hook reads it again after the save and keeps it open).
 * `all` for Detach all (round 5): every member, so the group path ends, and the toast says so.
 */
export async function detachFor(
    marcherIds: readonly number[],
    all = false,
): Promise<void> {
    const { session, saving } = usePathPenStore.getState();
    if (!session?.target.group || saving || marcherIds.length === 0) return;
    const one = marcherIds.length === 1;
    // Opened again after the save (`openNext`), not kept open as the group path
    if (one && !session.object) clearPath();
    usePathPenStore.setState({ saving: true });
    try {
        const { routes } = await detachFromGroupPath({
            db,
            timelineId: session.target.timelineId,
            marcherIds,
        });
        const copy = one ? routes[marcherIds[0]!] : undefined;
        // Said in words, with Undo (interaction round 2: testers couldn't tell Detach worked)
        toastWithUndo(
            all
                ? tolgee.t(
                      "pathways.toasts.groupEnded",
                      "{count, plural, one {Group path ended: # marcher has their own path} other {Group path ended: # marchers have their own paths}}",
                      { count: marcherIds.length },
                  )
                : tolgee.t(
                      "pathways.toasts.detached",
                      "{count, plural, one {# marcher detached} other {# marchers detached}}",
                      { count: marcherIds.length },
                  ),
        );
        usePathPenStore.setState((state) => ({
            saved: state.saved + 1,
            openNext: one && !session.object ? marcherIds[0]! : null,
            // A spot Detached from the group path open as an object: its copy is the object now,
            // read again by its route and kept open
            ...(copy !== undefined &&
            session.object &&
            state.session?.object &&
            state.session.target.routeId === session.target.routeId
                ? {
                      session: {
                          ...state.session,
                          target: { ...state.session.target, routeId: copy },
                          lane: null,
                          selected: null,
                      },
                  }
                : {}),
        }));
    } catch (error) {
        toastTimelineError(
            error,
            tolgee.t("pathways.errors.save", "Couldn't save the path"),
        );
    } finally {
        usePathPenStore.setState({ saving: false });
    }
}

/**
 * Rejoin (AP-R10): the selected marchers off the group path follow it, one undo step: a Detached
 * marcher goes back to its spot's lane without its copy or Adjust (owner Q4), another marcher joins
 * the group. The group path is the one shown, the one a shown copy was Detached from, or with only
 * marchers off any group path selected, the move's only one.
 */
export async function rejoinFor(target: RejoinTarget | null): Promise<void> {
    const { saving } = usePathPenStore.getState();
    if (!target || saving || target.marcherIds.length === 0) return;
    usePathPenStore.setState({ saving: true });
    try {
        const { dropped } = await rejoinGroupPath({
            db,
            timelineId: target.timelineId,
            routeId: target.routeId,
            marcherIds: target.marcherIds,
        });
        // Sim round 3: Rejoin dropped a bend with nothing said. It says what went, with Undo
        const count = target.marcherIds.length;
        toastWithUndo(
            dropped.length > 0
                ? tolgee.t(
                      "pathways.toasts.rejoinedDropped",
                      "Rejoined {count, plural, one {# marcher} other {# marchers}} to the group path. {dropped, plural, one {# line lost its own shape} other {# lines lost their own shapes}}",
                      { count, dropped: dropped.length },
                  )
                : tolgee.t(
                      "pathways.toasts.rejoined",
                      "Rejoined {count, plural, one {# marcher} other {# marchers}} to the group path",
                      { count },
                  ),
        );
        usePathPenStore.setState((state) => {
            const s = state.session;
            // Rejoined from its copy open as an object: the copy is gone, so the group path it
            // went back to is the object now, open, with the rejoined lane picked
            const fromCopy =
                s?.object &&
                s.phase === "open" &&
                s.target.lane?.detachedFrom === target.routeId;
            return {
                saved: state.saved + 1,
                ...(fromCopy
                    ? {
                          session: {
                              ...s,
                              target: { ...s.target, routeId: target.routeId },
                              selected: null,
                              lane:
                                  target.marcherIds.length === 1
                                      ? {
                                            marcherId: target.marcherIds[0]!,
                                            key: null,
                                        }
                                      : null,
                          },
                      }
                    : {}),
            };
        });
    } catch (error) {
        toastTimelineError(
            error,
            tolgee.t("pathways.errors.save", "Couldn't save the path"),
        );
    } finally {
        usePathPenStore.setState({ saving: false });
    }
}
