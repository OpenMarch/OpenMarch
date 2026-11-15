import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { translateTimelineText } from "@/timeline/translateTimelineText";
import { allMarchersQueryOptions } from "@/hooks/queries";
import { readGroupPaths } from "@/db-functions/timelineGroupRoutes";
import tolgee from "@/global/singletons/Tolgee";
import { db } from "@/global/database/db";
import { performersOnly } from "@/global/classes/Marcher";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useStartFlagLevelsInEffect } from "@/stores/StartFlagKeyStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import type { XY } from "@/shapes/types";
import { prefersReducedMotion } from "@/components/timeline/reducedMotion";
import {
    cancelFollowDrawing,
    followMarchersOf,
    ripplesIn,
    setFollowEnds,
    setFollowPreview,
} from "./followDrag";
import { isTrailLineAt, openFollowTool } from "./followTool";
import {
    closeShapeTool,
    useShapeToolStore,
} from "@/shapes/tool/shapeToolStore";
import {
    findGroupDrawTarget,
    findGroupTarget,
    findPathTarget,
    drawnAsGroup,
    findTrailDrawTarget,
    findTrailTarget,
    groupMoveAt,
    pathObjectsAt,
    refitNeeded,
    readPathObjectIndex,
    rejoinTargetOf,
    type PathObjectIndex,
    type PathTarget,
} from "./pathTarget";
import {
    acknowledgeOpenPath,
    adjustMember,
    adjustTargetOf,
    deleteAdjustKey,
    deleteOnLane,
    resetSpot,
    resetTargetOf,
    refitOpenPath,
    selectLane,
    setGroupCommands,
    setPathObjects,
    type PathObject,
    type RejoinTarget,
    clearPath,
    closePath,
    deletePoint,
    finishDrawing,
    openPath,
    detachFor,
    detachIdsOf,
    rejoinFor,
    removeLastPoint,
    removePath,
    reverseShownTrail,
    switchDrawing,
    selectPoint,
    setPathHidden,
    setPointSmooth,
    showPath,
    startDrawing,
    usePathPenStore,
} from "./pathPenStore";

/**
 * Why the pen can't start for this selection, or null when it can: one performer draws its own
 * path, two or more a group path (step 15).
 */
export function penRefusal(selectedCount: number): string | null {
    if (selectedCount === 0)
        return tolgee.t(
            "pathways.refusals.selectOne",
            "Select a marcher to draw a path for",
        );
    return null;
}

/**
 * The Path pen's command (P), the path shown and its commands (pathways step 1). P with one
 * marcher selected starts drawing its move at the playhead; with several, it refuses ("one marcher
 * for now"). With marchers selected whose move at the playhead has a path, the path is drawn on
 * the field quiet (closed): nothing to grab, and a compact bar with Edit path, the member commands
 * and Remove path. One click on its line, Enter or Edit path makes it active for editing
 * (interaction system, rule 2), until Escape, a selection off its marchers, or a move of the
 * playhead off the move. Remove path works active or quiet.
 */
export function usePathPenActions(): void {
    const selectedContext = useSelectedMarchers();
    const selected = selectedContext?.selectedMarchers;
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    const performers = performersOnly(selected ?? []);
    const one = performers.length === 1 ? performers[0]! : null;
    // Every marcher's drill number, as a group path's members are named
    const { data: allMarchers } = useQuery(allMarchersQueryOptions());
    const drills = useMemo(
        () => new Map((allMarchers ?? []).map((m) => [m.id, m.drill_number])),
        [allMarchers],
    );
    const playheadBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    const version = useTimelineResolverStore((s) => s.version);
    const ready = useTimelineResolverStore((s) => s.status === "ready");
    const saved = usePathPenStore((s) => s.saved);
    const phase = usePathPenStore((s) => s.session?.phase ?? null);
    const hasRoute = usePathPenStore(
        (s) => (s.session?.target.routeId ?? null) !== null,
    );
    // A stored trail is shown (pathways step 4): Reverse and Remove trail act on it
    const trailShown = usePathPenStore(
        (s) => !!s.session?.target.trail && s.session.target.routeId !== null,
    );
    const selectedIds = performers.map((m) => m.id).sort((a, b) => a - b);
    const selectionKey = selectedIds.join(",");

    // The marchers selected when P drew the open path again (AP-O8): the drawing goes when they
    // change, as a personal drawing does
    const againFor = useRef("");
    useActionHandler("pathPen", () => {
        // With a path selected as an object, or a path open however it was opened, P draws that
        // path again: a path edit by its route, keeping its id, never refused for who holds its
        // spots (AP-O8, J.8 AP-R1, 07 N3)
        const now = usePathPenStore.getState().session;
        if (
            now &&
            now.target.routeId !== null &&
            (now.object || now.phase === "open") &&
            now.phase !== "drawing" &&
            !isPlaying
        ) {
            if (useShapeToolStore.getState().tool) closeShapeTool();
            againFor.current = now.object ? "" : selectionKey;
            startDrawing(now.target, now.drill, now.object, true);
            return;
        }
        // The line's trail shown (pathways step 4): P draws the trail again, as Follow does
        if (
            now?.target.trail &&
            now.target.routeId !== null &&
            now.phase !== "drawing" &&
            !isPlaying
        ) {
            if (useShapeToolStore.getState().tool) closeShapeTool();
            againFor.current = selectionKey;
            startDrawing(now.target, now.drill, false, true);
            return;
        }
        const refusal = penRefusal(performers.length);
        if (refusal) {
            toast.error(refusal, { id: "path-pen" });
            return;
        }
        // Already drawing this kind of path: P changes nothing
        if (now?.phase === "drawing" && !now.target.trail) return;
        if (isPlaying) {
            toast.error(
                tolgee.t(
                    "pathways.refusals.playing",
                    "Stop playback to draw a path",
                ),
                { id: "path-pen" },
            );
            return;
        }
        const resolver = useTimelineResolverStore.getState().resolver;
        if (!resolver) return;
        const beat = useTimelineSelectionStore.getState().playheadBeat;
        if (!one) {
            // Two or more: one group path for them all (AP-R8), from the middle of their starts
            const ids = performers.map((m) => m.id);
            void findGroupDrawTarget(db, resolver, ids, drills, beat).then(
                (target) => {
                    if ("kind" in target) {
                        const who = performers.find(
                            (m) =>
                                target.kind === "noMove" &&
                                m.id === target.marcherId,
                        );
                        toast.error(
                            target.kind === "noMove"
                                ? tolgee.t(
                                      "pathways.refusals.noMove",
                                      "{marcher} has no move at the playhead to draw a path on",
                                      { marcher: who?.drill_number ?? "" },
                                  )
                                : tolgee.t(
                                      "pathways.refusals.twoMoves",
                                      "These marchers are in different moves at the playhead: select marchers of one move to draw a group path",
                                  ),
                            { id: "path-pen" },
                        );
                        return;
                    }
                    if (useShapeToolStore.getState().tool) closeShapeTool();
                    // From a trail being drawn (Together on the path bar): the same points
                    if (!switchDrawing(target, `${ids.length}`))
                        startDrawing(target, `${ids.length}`);
                },
            );
            return;
        }
        const marcher = one;
        void findPathTarget(db, resolver, marcher.id, beat).then((target) => {
            if (!target) {
                toast.error(
                    tolgee.t(
                        "pathways.refusals.noMove",
                        "{marcher} has no move at the playhead to draw a path on",
                        { marcher: marcher.drill_number },
                    ),
                    { id: "path-pen" },
                );
                return;
            }
            if (useShapeToolStore.getState().tool) closeShapeTool();
            startDrawing(target, marcher.drill_number);
        });
    });

    // Follow (pathways step 4, AP-T1): the pen draws a trail for the selected line. With the
    // line's trail shown, it is drawn again; while a group path is being drawn for the same
    // marchers, the drawing becomes a trail and keeps its points
    useActionHandler("followTrail", () => {
        const now = usePathPenStore.getState().session;
        if (now?.phase === "drawing" && now.target.trail) return;
        // The line's trail shown: drawn again, whoever of the line is selected
        if (
            now?.target.trail &&
            now.target.routeId !== null &&
            now.phase !== "drawing" &&
            !isPlaying
        ) {
            if (useShapeToolStore.getState().tool) closeShapeTool();
            againFor.current = selectionKey;
            startDrawing(now.target, now.drill, now.object, true);
            return;
        }
        const refusal =
            performers.length < 2
                ? tolgee.t(
                      "pathways.refusals.followTwo",
                      "Select the marchers of a line (two or more) to follow a trail",
                  )
                : isPlaying
                  ? tolgee.t(
                        "pathways.refusals.playing",
                        "Stop playback to draw a path",
                    )
                  : null;
        if (refusal) {
            toast.error(refusal, { id: "path-pen" });
            return;
        }
        const resolver = useTimelineResolverStore.getState().resolver;
        if (!resolver) return;
        const beat = useTimelineSelectionStore.getState().playheadBeat;
        const ids = performers.map((m) => m.id);
        // The Follow tool (step 4b): its ends pulse until one is pressed and a trail dragged
        // out of it. Step 4's Follow still draws a trail when the selection is exactly a
        // trail's line (drawn again, AP-T1 and AP-T2's "Again"), or while a group path is drawn
        // for the same marchers (Together | Follow on the path bar keeps its points)
        const now2 = usePathPenStore.getState().session;
        const groupDrawing =
            now2?.phase === "drawing" &&
            !!now2.target.group &&
            now2.target.routeId === null;
        void (async () => {
            if (!groupDrawing && !(await isTrailLineAt(db, ids, beat))) {
                const refused = await openFollowTool(
                    resolver,
                    ids,
                    drills,
                    beat,
                );
                if (refused) toast.error(refused, { id: "path-pen" });
                else if (useShapeToolStore.getState().tool) closeShapeTool();
                return;
            }
            const target = await findTrailDrawTarget(
                db,
                resolver,
                ids,
                drills,
                beat,
            );
            if ("kind" in target && target.kind === "refused") {
                // Said before drawing starts, so no drawing is lost (AP-T1)
                toast.error(translateTimelineText(target.reason), {
                    id: "path-pen",
                });
                return;
            }
            if ("kind" in target) {
                const who = performers.find(
                    (m) =>
                        target.kind === "noMove" && m.id === target.marcherId,
                );
                toast.error(
                    target.kind === "noMove"
                        ? tolgee.t(
                              "pathways.refusals.noMove",
                              "{marcher} has no move at the playhead to draw a path on",
                              { marcher: who?.drill_number ?? "" },
                          )
                        : tolgee.t(
                              "pathways.refusals.followTwoMoves",
                              "These marchers are in different moves at the playhead: select marchers of one move to follow a trail",
                          ),
                    { id: "path-pen" },
                );
                return;
            }
            if (useShapeToolStore.getState().tool) closeShapeTool();
            if (!switchDrawing(target, `${ids.length}`))
                startDrawing(target, `${ids.length}`);
        })();
    });
    // Off for a dragged-out line (owner, 2026-11-10): it ends along its trail
    const trailAlong = usePathPenStore(
        (s) => s.session?.target.trail?.along === true,
    );
    // ▶ Preview (step 4c, DL-17): while a trail is dragged out From trail, with something drawn,
    // and the system allows motion
    const canPreview = usePathPenStore(
        (s) =>
            (!!s.session?.points.length ||
                (!!s.session?.follow && ripplesIn(s.session.follow))) &&
            followMarchersOf(s.session) !== null,
    );
    // The Follow tool's Ends (DL-8, AP-T9, RP-1): offered with end spots here; Ripple in with a
    // form to ripple into, else said why
    const followOpen = usePathPenStore((s) => !!s.session?.follow);
    const hasKeep = usePathPenStore((s) => !!s.session?.follow?.keep);
    const hasForm = usePathPenStore(
        (s) => !!s.session?.follow?.keep && !!s.session.follow.form,
    );
    const formWhy = usePathPenStore((s) => s.session?.follow?.formWhy ?? null);
    const noSpots = tolgee.t(
        "pathways.editor.endsNeedSpots",
        "Ripple in and Keep end spots follow into end spots the line already has on this page. Place them first (a shape tool, or move the marchers), then choose Follow",
    );
    useActionHandler("followEndsTrail", () => setFollowEnds("trail"), {
        enabled: followOpen && hasKeep,
        disabledReason: followOpen ? noSpots : undefined,
    });
    useActionHandler("followEndsKeep", () => setFollowEnds("keep"), {
        enabled: followOpen && hasKeep,
        disabledReason: followOpen ? noSpots : undefined,
    });
    useActionHandler("followEndsRipple", () => setFollowEnds("ripple"), {
        enabled: followOpen && hasForm,
        disabledReason: !followOpen
            ? undefined
            : hasKeep
              ? (formWhy ?? noSpots)
              : noSpots,
    });
    useActionHandler(
        "followPreview",
        () => {
            const follow = usePathPenStore.getState().session?.follow;
            if (follow) setFollowPreview(!follow.preview);
        },
        { enabled: canPreview && !prefersReducedMotion() },
    );
    useActionHandler("reverseTrail", () => void reverseShownTrail(), {
        enabled: trailShown && phase !== "drawing" && !trailAlong,
        disabledReason: trailAlong
            ? tolgee.t(
                  "timeline.refusals.trail.reverseAlong",
                  "Reverse leader is off for a trail dragged out of a line. Drag the trail out of the other end instead.",
              )
            : undefined,
    });

    // The selected marchers' paths always show, whatever start flag positions' paths level says:
    // that level is for the marchers not selected (interaction round 2: with Paths Off, testers
    // couldn't find the path of the marcher they had selected)
    useEffect(() => setPathHidden(false), []);

    // Edit path: opens the selected marcher's path at the playhead, as a double-click on it does.
    // No key of its own: the shape tool has none for editing points (Enter places a shape)
    // Adjusting one lane, it goes back to editing the group path (its line shows only then)
    const adjusting = usePathPenStore(
        (s) => s.session?.phase === "open" && !!s.session.lane,
    );
    useActionHandler("editPath", () => void openPath(), {
        enabled: phase === "closed" || adjusting,
    });
    // Adjust (interaction round 2): the one selected member's lane alone, editable
    const adjustWho = usePathPenStore(
        useShallow((s) => adjustTargetOf(s.session, s.ownable)),
    );
    const adjustId = "marcherId" in adjustWho ? adjustWho.marcherId : null;
    useActionHandler(
        "adjustPath",
        () => {
            if (adjustId !== null) adjustMember(adjustId);
        },
        {
            enabled: adjustId !== null,
            disabledReason:
                "reason" in adjustWho ? adjustWho.reason : undefined,
        },
    );
    // Enter makes the selection's quiet path active, as a click on its line does (interaction
    // system, rule 2), and as Edit path does a hidden one. Not while a shape tool has Enter (Set
    // order's keys sit on top)
    const quietShown = usePathPenStore((s) => s.session?.phase === "closed");
    const shapeToolOpen = useShapeToolStore((s) => s.tool !== null);
    useActionHandler(
        "applyShape",
        () => void openPath(),
        { label: tolgee.t("actions.path.edit", "Edit path") },
        quietShown && !shapeToolOpen && !isPlaying,
    );
    // Remove path (AP-R2), open or closed, not while a new one is drawn
    useActionHandler("removePath", () => void removePath(), {
        enabled: hasRoute && phase !== "drawing",
        // On a trail it is named for what goes (pathways step 4, AP-T4)
        label: trailShown
            ? tolgee.t("actions.path.removeTrail", "Remove trail")
            : undefined,
    });
    // Re-fit (decision A), open or closed, only when the ends have moved
    const canRefit = usePathPenStore(
        (s) =>
            s.session !== null &&
            s.session.phase !== "drawing" &&
            refitNeeded(s.session.target),
    );
    useActionHandler("refitPath", () => void refitOpenPath(), {
        enabled: canRefit,
    });
    // Adjust's named actions, on the lane or key picked on the open group path (decision C)
    const lane = usePathPenStore((s) =>
        s.session?.phase === "open" ? (s.session.lane ?? null) : null,
    );
    // Reset adjustment: the lane picked, or the one member selected, when it's adjusted (one
    // ladder with Rejoin, interaction system rule 5)
    const resetId = usePathPenStore((s) => resetTargetOf(s.session, s.ownable));
    const rehomedOpen = usePathPenStore(
        (s) =>
            s.session?.target.group?.members.some((m) => m.adjust?.rehomed) ??
            false,
    );
    useActionHandler(
        "adjustRemoveKey",
        () => {
            if (lane && lane.key !== null)
                void deleteAdjustKey(lane.marcherId, lane.key);
        },
        { enabled: lane !== null && lane.key !== null },
    );
    useActionHandler(
        "adjustResetSpot",
        () => {
            if (resetId !== null) void resetSpot(resetId);
        },
        { enabled: resetId !== null && phase !== "drawing" },
    );
    useActionHandler("adjustAcknowledge", () => void acknowledgeOpenPath(), {
        enabled: rehomedOpen,
    });
    // Detach and Rejoin (AP-R9, AP-R10), enabled whenever a group path is shown, closed too
    const selectedMembers = usePathPenStore((s) => s.ownable);
    const detachSession = usePathPenStore((s) => s.session);
    const ownIds = detachIdsOf(selectedMembers, detachSession);
    const rejoin = usePathPenStore((s) => s.rejoin);
    useActionHandler("detachPath", () => void detachFor(ownIds), {
        enabled: ownIds.length > 0 && phase !== "drawing",
    });
    useActionHandler("rejoinPath", () => void rejoinFor(rejoin), {
        enabled: rejoin !== null && phase !== "drawing",
    });

    // The path shown follows the selection, the playhead and each committed edit; a path opened
    // stays open while it's the same marcher's same move
    const asked = useRef(0);
    useEffect(() => {
        const { session } = usePathPenStore.getState();
        const resolver = useTimelineResolverStore.getState().resolver;
        const clear = () => {
            clearPath();
            setGroupCommands([], null);
        };
        if (isPlaying) {
            clear();
            return;
        }
        if (session?.phase === "drawing") {
            // The marchers drawn for are let go of: the drawing goes. Drawing a selected path
            // again (AP-O8) has no marcher selected, and goes when one is
            const drawnFor = session.object
                ? ""
                : session.byRoute
                  ? againFor.current
                  : (session.target.trail
                        ? session.target.trail.members
                              .map((m) => m.marcherId)
                              .sort((a, b) => a - b)
                        : session.target.group
                          ? session.target.group.members.map((m) => m.marcherId)
                          : [session.target.marcherId]
                    ).join(",");
            if (drawnFor !== selectionKey) clearPath();
            return;
        }
        if (selectedIds.length === 0 || !ready || !resolver) {
            clear();
            return;
        }
        const ask = ++asked.current;
        const beat = playheadBeat;
        void (async () => {
            // A trail when the selected marchers are all in one follow move's line (step 4)
            const trail = await findTrailTarget(
                db,
                resolver,
                selectedIds,
                drills,
                beat,
            );
            if (trail) {
                if (ask !== asked.current) return;
                const now = usePathPenStore.getState();
                if (now.session?.phase === "drawing") return;
                setGroupCommands([], null);
                showPath(trail, `${trail.trail!.members.length}`);
                return;
            }
            // A group path when any selected marcher walks one (step 15), else one marcher's own
            const group = await findGroupTarget(
                db,
                resolver,
                selectedIds,
                drills,
                beat,
            );
            const own =
                group === null && one
                    ? await findPathTarget(db, resolver, one.id, beat)
                    : null;
            // Where Rejoin goes (AP-R10): read the move's group paths unless a group path that
            // isn't a copy is shown (its outside marchers are the only ones it takes)
            const move =
                group === null || group.lane?.detachedFrom != null
                    ? await groupMoveAt(db, selectedIds, beat)
                    : null;
            const rejoinTarget: RejoinTarget | null =
                move === null
                    ? rejoinTargetOf(
                          group,
                          null,
                          group!.timelineId,
                          selectedIds,
                      )
                    : move.kind === "move"
                      ? rejoinTargetOf(
                            group,
                            await readGroupPaths(db, move.timelineId),
                            move.timelineId,
                            selectedIds,
                        )
                      : null;
            if (ask !== asked.current) return;
            const now = usePathPenStore.getState();
            if (now.session?.phase === "drawing") return;
            if (group) {
                const members = new Set(
                    group.group!.members.map((m) => m.marcherId),
                );
                // A Detached copy is its marcher's path: named by its drill number
                showPath(
                    group,
                    group.lane && members.size === 1
                        ? group.group!.members[0]!.drill
                        : `${members.size}`,
                );
                setGroupCommands(
                    // A one-lane path has nobody to Detach from
                    group.lane
                        ? []
                        : selectedIds.filter((id) => members.has(id)),
                    rejoinTarget,
                );
                // The lane picked is a selected marcher's: selected away, it's let go
                const picked = usePathPenStore.getState().session?.lane;
                if (picked && !selectedIds.includes(picked.marcherId))
                    selectLane(null);
                return;
            }
            setGroupCommands([], rejoinTarget);
            if (!own || own.routeId === null) clearPath();
            else showPath(own, one!.drill_number);
        })();
        // The marchers' ids, not their rows: a row read again is the same selection
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectionKey, playheadBeat, version, ready, isPlaying, saved, drills]);

    usePathObjects(drills);
}

/** How a path target is named: its marcher's drill number, or its group's size */
const drillOf = (target: PathTarget, drills: ReadonlyMap<number, string>) =>
    target.trail
        ? `${target.trail.members.length}`
        : target.lane && target.group?.members.length === 1
          ? target.group.members[0]!.drill
          : target.group
            ? `${target.group.members.length}`
            : (drills.get(target.marcherId) ?? `${target.marcherId}`);

/** How many points an own path object's drawn walk is sampled at, for its click test */
const WALK_SAMPLES = 96;

/** The start flag window an own path object's walk is drawn in, as Paths All has it now */
let walkWindow = { from: 0, to: 0 };

/** Each own path's sampled walk, for the window it was sampled in */
const walks = new WeakMap<
    PathTarget,
    { from: number; to: number; walk: readonly XY[] }
>();

/**
 * An own path's drawn line (AP-O3): its marcher's walk inside the window, from the start flag (or
 * the move's start) to the beat shown (or the move's end), sampled the first time it's tested for
 * this window. A target belongs to one timeline version, so its walk can be kept.
 */
function walkOf(target: PathTarget): readonly XY[] {
    const lo = Math.max(walkWindow.from, target.start);
    const hi = Math.min(walkWindow.to, target.end);
    const kept = walks.get(target);
    if (kept && kept.from === lo && kept.to === hi) return kept.walk;
    const resolver = useTimelineResolverStore.getState().resolver;
    const walk: XY[] = [];
    if (resolver && hi > lo)
        for (let i = 0; i <= WALK_SAMPLES; i++) {
            const p = resolver.positionAt(
                target.marcherId,
                lo + ((hi - lo) * i) / WALK_SAMPLES,
            );
            walk.push({ x: p[0], y: p[1] });
        }
    walks.set(target, { from: lo, to: hi, walk });
    return walk;
}

/** Each target's object, so the same target gives the same object (and drawing) */
const objectsByTarget = new WeakMap<PathTarget, PathObject>();

function objectOf(
    target: PathTarget,
    drills: ReadonlyMap<number, string>,
): PathObject {
    let o = objectsByTarget.get(target);
    if (!o) {
        o = {
            target,
            drill: drillOf(target, drills),
            walk: drawnAsGroup(target) ? null : () => walkOf(target),
        };
        objectsByTarget.set(target, o);
    }
    return o;
}

/**
 * Paths All's path objects (step 3a, AP-O2): with start flag positions drawing every marcher's
 * path, every path in a move at the playhead is listed, so a click selects it with nothing
 * selected, and each group path is drawn as its one line with faint lanes (AP-O7). An own path's
 * line is the start flag positions' path, so its walk inside the window (from the start flag, or
 * the move's start, to the beat shown, or the move's end) is what a click tests. None otherwise.
 *
 * The routes are read once per timeline version; a playhead step only filters them, and a route
 * keeps its target and object until the next version, so a step that changes no path sets
 * nothing (review of #737, S2).
 */
function usePathObjects(drills: ReadonlyMap<number, string>): void {
    const level = useStartFlagLevelsInEffect();
    const inRange = useTimelineSelectionStore(
        (s) => s.selection.kind === "range",
    );
    const isolating = useTimelineSelectionStore((s) => s.isolation !== null);
    const startHidden = useTimelineSelectionStore((s) => s.startHidden);
    const fromBeat = useTimelineSelectionStore((s) => s.startBeat);
    const toBeat = useTimelineSelectionStore(displayedBeat);
    const playheadBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    const version = useTimelineResolverStore((s) => s.version);
    const ready = useTimelineResolverStore((s) => s.status === "ready");
    const wanted =
        ready &&
        !isPlaying &&
        level.paths === "all" &&
        level.dots !== "off" &&
        inRange &&
        !isolating &&
        !startHidden &&
        toBeat > fromBeat;
    walkWindow = { from: fromBeat, to: toBeat };
    const asked = useRef(0);
    const index = useRef<{
        version: number;
        resolver: unknown;
        read: Promise<PathObjectIndex>;
    } | null>(null);
    useEffect(() => {
        const resolver = useTimelineResolverStore.getState().resolver;
        const ask = ++asked.current;
        if (!wanted || !resolver) {
            setPathObjects([]);
            return;
        }
        let cached = index.current;
        if (
            !cached ||
            cached.version !== version ||
            cached.resolver !== resolver
        ) {
            cached = { version, resolver, read: readPathObjectIndex(db) };
            index.current = cached;
        }
        const beat = playheadBeat;
        cached.read.then(
            (read) => {
                if (ask !== asked.current) return;
                setPathObjects(
                    pathObjectsAt(read, resolver, beat, drills).map((t) =>
                        objectOf(t, drills),
                    ),
                );
            },
            () => {
                if (index.current === cached) index.current = null;
                if (ask === asked.current) setPathObjects([]);
            },
        );
    }, [wanted, playheadBeat, version, drills]);
    useEffect(() => () => setPathObjects([]), []);
}

/**
 * The keys the pen takes over while it draws or a path is open (not while it's only shown,
 * closed), mounted after the editor's own handlers (as the shape tool's are), so they sit on top
 * and go back when the pen closes. They are the Line's keys (`ShapeToolKeys`):
 *
 * - Drawing: Enter (applyShape) finishes, Backspace or Delete (shapeRemoveLastPoint) and undo take
 *   the last point back, Escape (cancelAlignmentUpdates) cancels.
 * - Active (open): Escape lets go of the picked lane or point, then makes the path quiet (it
 *   stays drawn, and the next Escape deselects, the field's); Backspace or Delete deletes the
 *   selected point (its last removes the path), and with none selected removes the path, one
 *   undo step, with a "Path removed" toast and Undo (interaction system, Q7).
 */
export function PathPenKeys(): null {
    const phase = usePathPenStore((s) => s.session?.phase ?? null);
    const picked = usePathPenStore((s) => s.session?.selected ?? null);
    const pickedLane = usePathPenStore((s) => s.session?.lane ?? null);
    const drawing = phase === "drawing";
    useActionHandler(
        "cancelAlignmentUpdates",
        () => {
            // Adjusting a lane: its picked handle goes first, then back to quiet (round 2)
            if (!drawing && pickedLane?.key != null)
                selectLane({ marcherId: pickedLane.marcherId, key: null });
            else if (!drawing && pickedLane !== null) closePath();
            else if (!drawing && picked !== null) selectPoint(null);
            // The Follow tool (step 4b): Escape cancels the trail drawn, then leaves the tool
            else if (drawing && cancelFollowDrawing()) return;
            else closePath();
        },
        {
            label: drawing
                ? tolgee.t("actions.path.cancel", "Cancel path")
                : pickedLane?.key != null
                  ? tolgee.t("actions.path.deselectPoint", "Deselect point")
                  : picked !== null
                    ? tolgee.t("actions.path.deselectPoint", "Deselect point")
                    : tolgee.t("actions.path.close", "Close path"),
        },
    );
    useActionHandler(
        "applyShape",
        () => void finishDrawing(),
        {
            label: tolgee.t("actions.path.finish", "Finish path"),
        },
        drawing,
    );
    useActionHandler(
        "shapeRemoveLastPoint",
        () => {
            if (drawing) removeLastPoint();
            // A picked lane takes the key: its Adjust key goes, or the spot resets, never the path
            else if (pickedLane) void deleteOnLane(pickedLane);
            else if (picked !== null) {
                const index = Number(picked.slice(1));
                if (Number.isInteger(index))
                    void deletePoint(index, { selectNeighbor: true });
            }
            // The active path with no point selected (owner, 2026-11-04; interaction system Q7):
            // the path goes, one undo step, with a toast and Undo. Not on a quiet path, so a
            // stray key there removes nothing
            else void removePath();
        },
        {
            label: drawing
                ? tolgee.t("actions.path.removeLastPoint", "Remove last point")
                : pickedLane?.key != null
                  ? tolgee.t("actions.path.removeKey", "Remove key")
                  : pickedLane
                    ? tolgee.t("actions.path.resetSpot", "Reset spot")
                    : picked !== null
                      ? tolgee.t("actions.path.deletePoint", "Delete point")
                      : tolgee.t("actions.path.remove", "Remove path"),
        },
        drawing || phase === "open",
    );
    // While drawing, undo takes points back first, as a Line's points are; with none left it
    // cancels
    useActionHandler(
        "performUndo",
        () => {
            const s = usePathPenStore.getState().session;
            if (s && s.points.length > 0) removeLastPoint();
            else closePath();
        },
        {},
        drawing,
    );
    // Corner and Smooth for the selected point of the open path (the editor bar's either/or, the
    // palette); no keys of their own, as a Line's corner type has none
    const pickedIndex =
        !drawing && picked !== null ? Number(picked.slice(1)) : -1;
    const pointPicked = phase === "open" && pickedIndex >= 0;
    useActionHandler(
        "pathPointCorner",
        () => void setPointSmooth(pickedIndex, false),
        {},
        pointPicked,
    );
    useActionHandler(
        "pathPointSmooth",
        () => void setPointSmooth(pickedIndex, true),
        {},
        pointPicked,
    );
    return null;
}
