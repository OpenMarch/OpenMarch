import {
    createResolver,
    type ChangeBatch,
    type InvalidationReport,
    type Resolver,
    type TimelineSnapshot,
    type XY,
} from "@openmarch/core";
import {
    addSlotDestination,
    marcherFromImage,
    removeSlotDestination,
    shapeFromImage,
    slotDestinationFromImage,
    transitionFromImage,
    withPoints,
    type SlotDestinationIndex,
    type TimelineTables,
} from "./timelineRows";

/**
 * The resolver host for one open file (ADR 0001 §4, spec §10.2): the resolver plus the
 * post-commit mirror it reads marchers, shapes and transitions from.
 *
 * The resolver keeps a reference to `snapshot` and reads `marchers`, `shapes` and `transitions`
 * from it on every batch, so the mirror is updated in place, and always before
 * `resolver.notify`. `snapshot.assignments` is only the cold build's input: the resolver keeps
 * its own assignment index, updated from the batches.
 */
export interface TimelineHost {
    readonly snapshot: TimelineSnapshot;
    /** Individually placed destinations behind the shapeless transitions' `points` */
    readonly destinations: SlotDestinationIndex;
    /** Marcher homes by id, behind `snapshot.marchers` */
    readonly homes: Map<number, XY>;
    readonly resolver: Resolver;
}

/** Cold build: the resolver over a freshly read state. */
export function createTimelineHost(tables: TimelineTables): TimelineHost {
    const { snapshot, destinations } = tables;
    const homes = new Map<number, XY>(
        snapshot.marchers.map((m) => [m.id, m.home]),
    );
    return {
        snapshot,
        destinations,
        homes,
        resolver: createResolver(snapshot),
    };
}

/**
 * Brings the mirror to the batch's post-commit state. The changes are applied in log order, so
 * the last image of each row wins, exactly as the commit left it.
 */
export function applyBatchToMirror(
    host: TimelineHost,
    batch: ChangeBatch,
): void {
    const { snapshot, destinations, homes } = host;
    let marchersChanged = false;
    /** Transitions whose `points` may have changed */
    const pointsChanged = new Set<number>();

    for (const change of batch.changes) {
        switch (change.table) {
            case "marchers":
                marchersChanged = true;
                if (change.after) {
                    const m = marcherFromImage(change.after);
                    homes.set(m.id, m.home);
                } else homes.delete(change.rowId);
                break;
            case "shapes":
                if (change.after)
                    snapshot.shapes[change.rowId] = shapeFromImage(
                        change.after,
                    );
                else delete snapshot.shapes[change.rowId];
                break;
            case "transitions":
                if (change.after)
                    snapshot.transitions[change.rowId] = transitionFromImage(
                        change.after,
                    );
                else delete snapshot.transitions[change.rowId];
                pointsChanged.add(change.rowId);
                break;
            case "slot_destinations":
                if (change.before) {
                    const d = slotDestinationFromImage(change.before);
                    removeSlotDestination(destinations, d);
                    pointsChanged.add(d.transition);
                }
                if (change.after) {
                    const d = slotDestinationFromImage(change.after);
                    addSlotDestination(destinations, d);
                    pointsChanged.add(d.transition);
                }
                break;
            case "assignments":
                // The resolver indexes assignments itself, from the batch (spec §10.2)
                break;
        }
    }

    for (const id of pointsChanged) {
        const transition = snapshot.transitions[id];
        if (transition)
            snapshot.transitions[id] = withPoints(transition, destinations);
    }
    if (marchersChanged)
        snapshot.marchers = [...homes.entries()]
            .sort(([a], [b]) => a - b)
            .map(([id, home]) => ({ id, home }));
}

/**
 * Applies one committed batch: the mirror first, then the resolver, so the resolver sees exactly
 * the post-commit state (spec §10.2).
 */
export function applyTimelineBatch(
    host: TimelineHost,
    batch: ChangeBatch,
): InvalidationReport {
    applyBatchToMirror(host, batch);
    return host.resolver.notify(batch);
}
