import { useMemo } from "react";
import type { Resolver } from "@openmarch/core";
import { db } from "@/global/database/db";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import type { DbConnection } from "@/db-functions/types";
import type { NotJoined } from "@/db-functions/timelineJoinAtBeat";
import { marcherLabels } from "@/db-functions/timelineMembership";
import {
    unsetMarchersAt,
    type UnsetResult,
} from "@/db-functions/timelineUnset";
import { isBasicMode } from "@/stores/EditorModeStore";
import {
    displayedBeat,
    useTimelineSelectionStore,
    type PageBox,
} from "@/stores/TimelineSelectionStore";
import { lockedOnBox, useBasicLocksStore } from "./basicLocks";
import { toastBasicLock } from "./basicLockToast";
import { notJoinedMessage, toastTimelineError } from "./timelineErrorMessages";
import {
    followingPages,
    followingRuns,
    pageKeepStates,
    type KeepTranslate,
} from "./timelineKeepLater";
import { keepPagesOfBoxes } from "./timelineOnlyThisPage";
import { isSetAt, marcherSetBeats } from "./timelineSetFollowing";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";
import { holdTerms } from "./holdTerms";
import type { BeatRange, HoldLight } from "./timelineHoldBars";
import { clearHoldLight, setHoldLight } from "./holdLight";

/**
 * **Unset here** as the UI runs it (Set vs Following, #300 and #304): the selected marchers that
 * are Set on the playhead's count lose that coordinate and follow from earlier, while later pages
 * keep their spots (`unsetMarchersAt`). **Unset here and on Pages N–M** (#305) lets the later
 * pages that followed the spot follow back instead, and is offered only when some do
 * (`unsetFollowingPages`). Each is one undo step; a refusal is a toast, never thrown.
 */

const NOTHING: UnsetResult = { unset: [], joined: [], notJoined: [] };

/** What the Unset actions read for some marchers, worked out once per show version. */
interface UnsetReads {
    resolver: Resolver | null;
    marcherIds: readonly number[];
    boxes?: readonly PageBox[];
}

/**
 * The Unset actions' reads for `marcherIds` at any count (`unsetTargets`, `unsetFollowingPages`).
 * Each marcher's Set beats are worked out once, and each count's answers the first time it's
 * asked, so scrubbing with a large selection looks counts up instead of walking every move again.
 * Make a new one when the resolver version, selection or page boxes change.
 */
export function unsetReader({ resolver, marcherIds, boxes = [] }: UnsetReads): {
    targets: (beat: number) => number[];
    followingPages: (beat: number) => string[] | null;
    followingLight: (beat: number) => HoldLight | null;
} {
    let setBeats: Map<number, readonly number[]> | null = null;
    const setBeatsOf = (id: number) => {
        setBeats ??= new Map(
            resolver
                ? marcherIds.map((m) => [
                      m,
                      marcherSetBeats(resolverSpans(resolver, m)),
                  ])
                : [],
        );
        return setBeats.get(id) ?? [];
    };
    const targetsAt = new Map<number, number[]>();
    const targets = (beat: number): number[] => {
        if (!resolver || beat <= 0) return [];
        let out = targetsAt.get(beat);
        if (!out) {
            out = marcherIds
                .filter((id) => isSetAt(setBeatsOf(id), beat))
                .sort((a, b) => a - b);
            targetsAt.set(beat, out);
        }
        return out;
    };
    let pages: ReturnType<typeof keepPagesOfBoxes> | null = null;
    const followingAt = new Map<number, FollowingRun | null>();
    const runAt = (beat: number): FollowingRun | null => {
        if (followingAt.has(beat)) return followingAt.get(beat)!;
        const out = followingRunAt(beat);
        followingAt.set(beat, out);
        return out;
    };
    const followingRunAt = (beat: number): FollowingRun | null => {
        const set = targets(beat);
        if (!resolver || set.length === 0) return null;
        pages ??= keepPagesOfBoxes(boxes);
        const holding = pages.find(
            (p) => p.range && p.range.start < beat && beat <= p.flag,
        );
        if (!holding) return null;
        // Later pages follow the spot only if nothing of the marcher's own ends after it in this page
        const flag = holding.flag;
        const lastInPage = set.filter(
            (id) =>
                !resolverSpans(resolver, id).some(
                    (s) => s.kind !== "hold" && s.end > beat && s.end <= flag,
                ),
        );
        if (lastInPage.length === 0) return null;
        const states = pageKeepStates({
            pages,
            marcherIds: lastInPage,
            spansOf: (id) => resolverSpans(resolver, id),
        });
        const names = followingPages(states, holding.id)?.names;
        if (!names) return null;
        // Each marcher lights only its own run: one with a move of its own partway through the
        // pages named keeps the pages after that move where they are
        const byMarcher = new Map<number, BeatRange[]>();
        for (const [id, run] of followingRuns(states, holding.id))
            byMarcher.set(
                id,
                run.map((s) => ({ start: s.box.start, end: s.box.end })),
            );
        return { names, light: { byMarcher } };
    };
    return {
        targets,
        followingPages: (beat) => runAt(beat)?.names ?? null,
        followingLight: (beat) => runAt(beat)?.light ?? null,
    };
}

/** The pages that would follow back, by name, and the hold bars they light (fork #477). */
interface FollowingRun {
    readonly names: string[];
    readonly light: HoldLight;
}

/**
 * Of `marcherIds`, the ones Set at `beat` (`timelineSetFollowing`), ascending: what Unset acts on.
 * None on the first page (beat 0), where everyone is Set but nobody has a move to take back.
 */
export function unsetTargets({
    beat,
    ...reads
}: UnsetReads & { beat: number }): number[] {
    return unsetReader(reads).targets(beat);
}

/** `unsetReader` for `marcherIds` and the page boxes, new when the show or selection changes. */
function useUnsetReader(marcherIds: readonly number[]) {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const boxes = useTimelineSelectionStore((s) => s.pageBoxes);
    return useMemo(() => {
        void version; // a new version means new spans
        return unsetReader({ resolver, marcherIds, boxes });
    }, [resolver, version, marcherIds, boxes]);
}

/** `unsetTargets` for `marcherIds` at the count shown, kept current. */
export function useUnsetTargets(marcherIds: readonly number[]): number[] {
    const reader = useUnsetReader(marcherIds);
    const beat = useTimelineSelectionStore(displayedBeat);
    return useMemo(() => reader.targets(beat), [reader, beat]);
}

/**
 * The pages that follow the spot `marcherIds` have at `beat`, in page order: for the ones Set
 * there (`unsetTargets`), the page boxes after the one holding `beat`, in a row, that some of them
 * follow into without a move of their own (`followingPages`, as **Only Page N** reads
 * it). What **Unset here and on Pages N–M** lets follow back; null when none follow.
 */
export function unsetFollowingPages({
    beat,
    ...reads
}: UnsetReads & {
    beat: number;
    boxes: readonly PageBox[];
}): string[] | null {
    return unsetReader(reads).followingPages(beat);
}

/** **Unset here and on Pages N–M**'s label for the pages that follow (`unsetFollowingPages`). */
export function unsetFollowingLabel(
    pages: readonly string[],
    translate: KeepTranslate = (key, defaultValue, params) =>
        tolgee.t(key, defaultValue, params),
): string {
    const first = pages[0] ?? "";
    const last = pages[pages.length - 1] ?? first;
    return translate(
        "actions.timeline.unsetHereAndPagesMoveBack",
        "{count, plural, =1 {{removeKeyframe}, Page {first} moves back too} other {{removeKeyframe}, Pages {first}–{last} move back too}}",
        {
            ...holdTerms(),
            first,
            last,
            count: first === last ? 1 : pages.length,
        },
    );
}

/**
 * `unsetFollowingPages` for `marcherIds` at the count shown, kept current, with the hold bars they
 * light while the entry is hovered or focused (`followingLight`).
 */
export function useUnsetFollowingPages(marcherIds: readonly number[]): {
    pages: string[] | null;
    light: () => HoldLight | null;
} {
    const reader = useUnsetReader(marcherIds);
    const beat = useTimelineSelectionStore(displayedBeat);
    return useMemo(
        () => ({
            pages: reader.followingPages(beat),
            light: () => reader.followingLight(beat),
        }),
        [reader, beat],
    );
}

/**
 * A keyframe diamond's menu at `beat` (#306), as the inspector offers the Unset actions at the count
 * shown: **Unset here** where some of `marcherIds` are Set at `beat`, and the second entry's label
 * where pages follow (`unsetFollowingPages`). Neither while playing.
 */
export function unsetMenuStateAt({
    isPlaying,
    ...at
}: Parameters<typeof unsetFollowingPages>[0] & { isPlaying: boolean }): {
    canUnset: boolean;
    followingLabel: string | null;
    followingLight: HoldLight | null;
} {
    if (isPlaying)
        return { canUnset: false, followingLabel: null, followingLight: null };
    const reader = unsetReader(at);
    const following = reader.followingPages(at.beat);
    return {
        canUnset: reader.targets(at.beat).length > 0,
        followingLabel: following ? unsetFollowingLabel(following) : null,
        followingLight: following ? reader.followingLight(at.beat) : null,
    };
}

/**
 * A keyframe diamond's menu for `marcherIds` (#306), by spec beat: `unsetMenuStateAt` read when
 * it opens, and the Unset actions at the diamond's count, leaving the playhead where it is.
 */
export function useKeyframeUnsetMenu(
    marcherIds: readonly number[],
    isPlaying: boolean,
) {
    return useMemo(
        () => ({
            stateFor: (beat: number) =>
                unsetMenuStateAt({
                    resolver: useTimelineResolverStore.getState().resolver,
                    boxes: useTimelineSelectionStore.getState().pageBoxes,
                    marcherIds,
                    beat,
                    isPlaying,
                }),
            onUnset: (beat: number) => void unsetHere(marcherIds, { beat }),
            onUnsetAndFollowing: (beat: number) =>
                void unsetHereAndFollowing(marcherIds, { beat }),
            // #477: hovering or focusing the follow-back entry lights what would follow back
            onFollowingPreview: (light: HoldLight | null) =>
                light
                    ? setHoldLight(KEYFRAME_MENU_LIGHT, light)
                    : clearHoldLight(KEYFRAME_MENU_LIGHT),
        }),
        [marcherIds, isPlaying],
    );
}

/** Who lights the hold bars while a diamond menu's follow-back entry is hovered (`setHoldLight`) */
const KEYFRAME_MENU_LIGHT = "keyframeMenu:followBack";

/** The page box holding `beat` (`start < beat ≤ end`), from the Basic locks' boxes. */
const boxHolding = (beat: number) =>
    useBasicLocksStore
        .getState()
        .boxes.find((b) => b.start < beat && beat <= b.end);

/** Where an Unset acts: the count shown unless `beat` names another (a keyframe diamond's, #306) */
export interface UnsetOptions {
    readonly beat?: number;
    readonly database?: DbConnection;
}

/**
 * **Unset here** for `marcherIds` at the count shown, or at `beat` without moving the playhead. In
 * Basic, marchers locked on the page (their moves there need Expert) are left alone with the lock
 * toast, and a shared move's slot is taken out rather than left vacant.
 */
export function unsetHere(
    marcherIds: readonly number[],
    options: UnsetOptions = {},
): Promise<UnsetResult> {
    return unsetSetMarchers(marcherIds, true, options);
}

/**
 * **Unset here and on Pages N–M** for `marcherIds` at the count shown (or `beat`): as
 * `unsetHere`, but the later pages that followed the spot follow back to the earlier one.
 */
export function unsetHereAndFollowing(
    marcherIds: readonly number[],
    options: UnsetOptions = {},
): Promise<UnsetResult> {
    return unsetSetMarchers(marcherIds, false, options);
}

async function unsetSetMarchers(
    marcherIds: readonly number[],
    keepLaterPages: boolean,
    {
        beat = displayedBeat(useTimelineSelectionStore.getState()),
        database = db,
    }: UnsetOptions,
): Promise<UnsetResult> {
    let targets = unsetTargets({
        resolver: useTimelineResolverStore.getState().resolver,
        marcherIds,
        beat,
    });
    const basic = isBasicMode();
    if (basic) {
        const box = boxHolding(beat);
        const locked = box ? lockedOnBox(box) : new Map<number, unknown>();
        const skipped = targets.filter((id) => locked.has(id));
        if (skipped.length > 0) {
            targets = targets.filter((id) => !locked.has(id));
            toastLockedUnset(skipped.length, targets.length > 0);
        }
    }
    if (targets.length === 0) return NOTHING;
    try {
        const result = await unsetMarchersAt({
            db: database,
            beat,
            marcherIds: targets,
            keepLaterPages,
            tidyShared: basic,
        });
        if (result.notJoined.length > 0)
            void toastNotJoined(result.notJoined, database);
        // Shape and follow-the-leader members of part of a group kept the plain Remove: say who
        // and why (a warning, since the rest was written)
        if (result.notTakenApart) toastTimelineError(result.notTakenApart);
        return result;
    } catch (error) {
        toastTimelineError(
            error,
            tolgee.t(
                "timeline.keyframes.removeError",
                "Couldn't remove the keyframes",
            ),
        );
        return NOTHING;
    }
}

/** Basic's lock toast for marchers Remove keyframe left alone (as `toastLockedMarchers`). */
function toastLockedUnset(count: number, wrote: boolean): void {
    toastBasicLock(
        wrote
            ? tolgee.t(
                  "timeline.keyframes.removeLocked",
                  "{count, plural, =1 {One marcher uses Expert moves on this page, so its keyframe wasn't removed. Switch to Expert to edit it.} other {# marchers use Expert moves on this page, so their keyframes weren't removed. Switch to Expert to edit them.}}",
                  { count },
              )
            : tolgee.t(
                  "timeline.keyframes.removeLockedAll",
                  "{count, plural, =1 {One marcher uses Expert moves on this page. Switch to Expert to edit it.} other {# marchers use Expert moves on this page. Switch to Expert to edit them.}}",
                  { count },
              ),
    );
}

/**
 * The toast for marchers whose moves around the count weren't joined (#470): they kept the plain
 * Remove. Their labels are read only here, when there is something to say.
 */
async function toastNotJoined(
    groups: readonly NotJoined[],
    database: DbConnection,
): Promise<void> {
    const labels = await marcherLabels(
        database,
        groups.flatMap((g) => g.marcherIds),
    );
    toast.warning(
        notJoinedMessage(
            groups,
            (id) => labels.get(id),
            (key, text, params) => tolgee.t(key, text, params),
        ),
        { id: "timeline-not-joined" },
    );
}
