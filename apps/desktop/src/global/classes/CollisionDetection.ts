import Page from "@/global/classes/Page";
import { pageEndBeat } from "@/timeline/pageEndBeat";
import type { PositionSource } from "@/timeline/positionBuffer";

/**
 * Collision detection over the resolver's positions (fork #226). Pure: the positions come from a
 * `PositionSource`, so tests pass a stand-in and the app the open file's resolver
 * (`useCollisionDetection`).
 */

/** Two marchers this close, in field units, collide. */
export const COLLISION_RADIUS = 10; // can probably be changed on the marcher level later on

/**
 * The most a marcher may move between two samples, in field units, so a pair passing through
 * each other is still caught.
 */
const MAX_SAMPLE_TRAVEL = COLLISION_RADIUS / 2;
/** Samples per beat at most, however fast the fastest marcher moves */
const MAX_SAMPLES_PER_BEAT = 32;

export interface CollisionData {
    marcher1Id: number;
    marcher2Id: number;
    label: string;
    x: number;
    y: number;
    distance: number;
}

/**
 * The beats whose collisions the selected page reports: from where its positions sit (its end
 * beat) through the move to the next page, as the Collisions tab ("on the next page") always did.
 * The last page has no move after it: only its own positions.
 */
export function collisionWindow(
    selectedPage: Pick<Page, "beats" | "nextPageId">,
    pages: readonly Pick<Page, "id" | "beats">[],
): { fromBeat: number; toBeat: number } {
    const fromBeat = pageEndBeat(selectedPage);
    const next =
        selectedPage.nextPageId == null
            ? undefined
            : pages.find((p) => p.id === selectedPage.nextPageId);
    return { fromBeat, toBeat: next ? pageEndBeat(next) : fromBeat };
}

/**
 * Every pair of marchers that comes within `COLLISION_RADIUS` of each other between two beats
 * (both included), once per pair, where they first do: x and y are the point between them and
 * `distance` how far apart they are there.
 *
 * Samples each beat finely enough that the marcher moving most in it travels at most half the
 * radius between samples (at most 32 samples a beat), then sweeps the marchers sorted by x
 * (sweep and prune), so a sample costs about n log n for n marchers.
 *
 * @param drillNumbers labels the pairs; a marcher without one is labeled by its id
 */
export function detectCollisions(
    source: PositionSource,
    fromBeat: number,
    toBeat: number,
    drillNumbers: ReadonlyMap<number, string>,
): CollisionData[] {
    const ids = source.marcherIds();
    const n = ids.length;
    if (n < 2 || !(toBeat >= fromBeat)) return [];

    let here = new Float64Array(2 * n);
    let next = new Float64Array(2 * n);
    const sample = new Float64Array(2 * n);
    if (!source.positionsAt(fromBeat, here)) return [];

    const sweep = new Sweep(ids, drillNumbers);
    sweep.check(here);
    for (let beat = fromBeat; beat < toBeat; beat++) {
        const end = Math.min(beat + 1, toBeat);
        if (!source.positionsAt(end, next)) break;
        const samples = Math.min(
            MAX_SAMPLES_PER_BEAT,
            Math.max(1, Math.ceil(maxTravel(here, next) / MAX_SAMPLE_TRAVEL)),
        );
        for (let k = 1; k < samples; k++) {
            if (source.positionsAt(beat + ((end - beat) * k) / samples, sample))
                sweep.check(sample);
        }
        sweep.check(next);
        [here, next] = [next, here];
    }
    return sweep.collisions;
}

/**
 * How far the marcher that moves most travels between two position buffers, in a straight line.
 * Assumes a marcher moves along about that line within a beat: a path that curves or doubles back
 * inside one beat travels further than this, so it is sampled more coarsely than the radius asks
 * and a brief brush can be missed. So can anyone faster than 32 half-radii (160 field units) a
 * beat, past `MAX_SAMPLES_PER_BEAT`, which bounds the cost of one marcher that jumps across the field.
 */
function maxTravel(a: Float64Array, b: Float64Array): number {
    let max = 0;
    for (let i = 0; i < a.length; i += 2) {
        const d = Math.hypot(b[i]! - a[i]!, b[i + 1]! - a[i + 1]!);
        if (d > max) max = d;
    }
    return max;
}

/**
 * The pairs found so far, and the marchers' order by x, kept between samples: marchers barely
 * move between two, so an insertion sort over the last order is close to linear.
 */
class Sweep {
    readonly collisions: CollisionData[] = [];
    private readonly order: Int32Array;
    private readonly seen = new Set<string>();
    private sorted = false;

    constructor(
        private readonly ids: readonly number[],
        private readonly drillNumbers: ReadonlyMap<number, string>,
    ) {
        this.order = Int32Array.from(ids, (_, i) => i);
    }

    check(positions: Float64Array): void {
        const order = this.order;
        if (!this.sorted) {
            order.sort((a, b) => positions[2 * a]! - positions[2 * b]!);
            this.sorted = true;
        } else {
            // Insertion sort by x, from the last sample's order
            for (let i = 1; i < order.length; i++) {
                const m = order[i]!;
                const x = positions[2 * m]!;
                let j = i - 1;
                while (j >= 0 && positions[2 * order[j]!]! > x) {
                    order[j + 1] = order[j]!;
                    j--;
                }
                order[j + 1] = m;
            }
        }
        for (let i = 0; i < order.length; i++) {
            const a = order[i]!;
            const ax = positions[2 * a]!;
            const ay = positions[2 * a + 1]!;
            for (let j = i + 1; j < order.length; j++) {
                const b = order[j]!;
                const dx = positions[2 * b]! - ax;
                if (dx > COLLISION_RADIUS) break; // no one further along x is close enough
                const distance = Math.hypot(dx, positions[2 * b + 1]! - ay);
                if (distance <= COLLISION_RADIUS)
                    this.add(a, b, distance, positions);
            }
        }
    }

    private add(a: number, b: number, distance: number, p: Float64Array) {
        // Ids ascend with their index (`PositionSource.marcherIds`)
        const [first, second] = a < b ? [a, b] : [b, a];
        const key = `${first},${second}`;
        if (this.seen.has(key)) return; // only where the pair first collides
        this.seen.add(key);
        const id1 = this.ids[first]!;
        const id2 = this.ids[second]!;
        this.collisions.push({
            marcher1Id: id1,
            marcher2Id: id2,
            label: `${this.drillNumbers.get(id1) ?? id1}, ${this.drillNumbers.get(id2) ?? id2}`,
            x: (p[2 * a]! + p[2 * b]!) / 2,
            y: (p[2 * a + 1]! + p[2 * b + 1]!) / 2,
            distance,
        });
    }
}
