import { BinaryReader } from "./binaryReader";
import { decodeCoordinateBlock } from "./crypto";
import type {
    DrillAudioSync,
    DrillFieldBorder,
    DrillGrid,
    DrillPerformer,
    DrillPoint,
    DrillSet,
} from "./types";
import { parseDrillLabel } from "./label";
import { discoverMarkers, type CoordinateRecord } from "./props";
import { readAudioSync } from "./sync";

/** Number of characters describing a single performer in a coordinate block. */
const RECORD_LENGTH = 39;
/** Size in bytes of a per-performer entry in a page's binary record table. */
const PAGE_RECORD_BYTES = 69;

const MAGIC = "3DJV";

/**
 * Result of walking the drill document. Coordinates for each set are keyed by
 * performer id and expressed in the source tool's field units.
 */
export interface DrillDocument {
    title?: string;
    performers: DrillPerformer[];
    props: DrillPerformer[];
    supplemental: DrillPerformer[];
    sets: DrillSet[];
    field: DrillFieldBorder;
    grid: DrillGrid;
    /**
     * Show-level production notes (a closing credit / thank-you block). Authors
     * conventionally type these into the final set's note after a blank line;
     * this is that trailing block, split out from the set's own move note.
     */
    productionNotes?: string;
    /** Total number of counts (page frames) in the show. */
    totalCounts: number;
    /** Per-count audio timestamps from `SYNC`, when present. */
    audioSync?: DrillAudioSync;
}

/** Sentinel grid used when a document lacks a readable `GRD1` chunk. */
const EMPTY_GRID: DrillGrid = {
    border: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    stepsPerUnitX: 1,
    stepsPerUnitY: 1,
    sidelinesY: [],
    hashesY: [],
    yardLinesX: [],
    measurementSystem: "imperial",
};

interface ParsedSet {
    id: string;
    name: string;
    /** Cumulative count at which the set is reached. */
    cumulativeCount: number;
    notes?: string;
    /**
     * The source's own subset marker: when true, the *next* set is a labeled
     * subset (a hold/continuation like `12A`). Read from the record trailer;
     * see {@link readSetList} and {@link buildSets}.
     */
    subsetFollows: boolean;
}

/**
 * Parses the binary drill document (the inner file of an interchange package)
 * into a normalized model.
 */
export async function parseDrillDocument(
    bytes: Uint8Array,
): Promise<DrillDocument> {
    const reader = new BinaryReader(bytes);
    if (reader.ascii(4) !== MAGIC) {
        throw new Error("Not a recognized drill document");
    }
    reader.seek(0);

    let title: string | undefined;
    let performers: DrillPerformer[] = [];
    let parsedSets: ParsedSet[] = [];
    let grid: DrillGrid = EMPTY_GRID;
    let audioSync: DrillAudioSync | undefined;
    const rawPages: RawPageFrame[] = [];

    while (reader.remaining >= 4) {
        const tag = reader.ascii(4);

        if (tag === "END.") break;

        if (tag === "PG15") {
            rawPages.push(readPageFrame(reader));
            continue;
        }
        if (tag === "SEL2" || tag === "VIS2") {
            skipChunk(reader);
            continue;
        }

        // Every other chunk is `tag + i32 length + payload`.
        if (reader.remaining < 4) break;
        const length = reader.i32();
        if (length < 0 || length > reader.remaining) break;
        const payload = reader.slice(length);

        switch (tag) {
            case "PRF3":
                title = readTitle(payload);
                break;
            case "CST7":
                performers = readCast(payload);
                break;
            case "PTB7":
                parsedSets = readSetList(payload);
                break;
            case "GRD1":
                grid = readGrid(payload) ?? grid;
                break;
            case "SYNC":
                audioSync = readAudioSync(payload) ?? audioSync;
                break;
            default:
                // Unhandled chunk (colors, playlist, props, editor state, etc.).
                // Page frames (PG15) are often interleaved with PRP8/SEL2/VIS2, so
                // we must not stop after the first page — keep scanning to END.
                break;
        }
    }

    const pages = await Promise.all(rawPages.map(decodePageFrame));
    const castIds = new Set(performers.map((p) => p.id));
    const boundaries = deriveSetStartCounts(parsedSets, pages.length);
    const { props, supplemental } = discoverMarkers(
        pages,
        castIds,
        grid,
        boundaries,
    );
    const markerIds = new Set([
        ...castIds,
        ...props.map((p) => p.id),
        ...supplemental.map((p) => p.id),
    ]);
    const sets = buildSets(parsedSets, pages, markerIds);
    const productionNotes = extractProductionNotes(sets);
    return {
        title,
        performers,
        props,
        supplemental,
        sets,
        field: grid.border,
        grid,
        productionNotes,
        totalCounts: pages.length,
        audioSync,
    };
}

/**
 * Splits a closing production note off the final set's note. The author's move
 * note and their show credit share the last set's single note field, separated
 * by a blank line; everything after the first blank line is treated as the
 * show-level note and removed from the set. Returns undefined when the last set
 * has no note or no blank-line split.
 */
function extractProductionNotes(sets: DrillSet[]): string | undefined {
    // The closing credit lives on the last set that actually has a note; a
    // trailing closing-hold page carries none, so skip past it.
    const last = [...sets].reverse().find((s) => s.notes);
    if (!last?.notes) return undefined;

    const blankLine = last.notes.match(/\n[ \t]*\n/);
    if (blankLine?.index === undefined) return undefined;

    const head = last.notes.slice(0, blankLine.index).trim();
    const tail = last.notes.slice(blankLine.index + blankLine[0].length).trim();
    if (!tail) return undefined;

    last.notes = head.length > 0 ? head : undefined;
    return tail;
}

interface PageFrame {
    /** marker id -> decoded coordinate record for this single count. */
    records: Map<string, CoordinateRecord>;
}

/** A page frame's performer count and still-encoded coordinate block. */
interface RawPageFrame {
    count: number;
    block: string;
}

function skipChunk(reader: BinaryReader): void {
    const length = reader.i32();
    reader.skip(length);
}

/**
 * A page frame is one count's worth of positions:
 * `i32 length, u16 stride, u16 count, count*69 record bytes, u16 blockLen, block`.
 * The declared length is unreliable (it overcounts the trailing block by two
 * bytes), so we advance strictly by the content we read.
 */
function readPageFrame(reader: BinaryReader): RawPageFrame {
    reader.i32(); // declared length (unreliable, ignored)
    reader.u16(); // record stride
    const count = reader.u16();
    reader.skip(count * PAGE_RECORD_BYTES);
    const blockLength = reader.u16();
    const block = reader.ascii(blockLength);
    return { count, block };
}

/** Decrypts a page frame's coordinate block into per-marker records. */
async function decodePageFrame({
    count,
    block,
}: RawPageFrame): Promise<PageFrame> {
    const decoded = await decodeCoordinateBlock(block);
    const records = new Map<string, CoordinateRecord>();
    for (let i = 0; i < count; i++) {
        const start = i * RECORD_LENGTH;
        const record = decoded.slice(start, start + RECORD_LENGTH);
        if (record.length < RECORD_LENGTH) break;
        const symbol = record[0]!;
        const id = String(parseInt(record.slice(1, 19), 10));
        const x = parseFloat(record.slice(19, 29));
        const y = parseFloat(record.slice(29, 39));
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        records.set(id, { id, symbol, point: { x, y } });
    }
    return { records };
}

/** `PRF3`: `u16 titleLen, title, ...`. */
function readTitle(payload: Uint8Array): string | undefined {
    const reader = new BinaryReader(payload);
    const length = reader.u16();
    if (length === 0 || length > reader.remaining) return undefined;
    return reader.utf8(length) || undefined;
}

/** `CST7`: `u16 count`, then `u64 id, i32 labelLen, label, 8 reserved bytes`. */
function readCast(payload: Uint8Array): DrillPerformer[] {
    const reader = new BinaryReader(payload);
    const count = reader.u16();
    const performers: DrillPerformer[] = [];
    for (let i = 0; i < count && reader.remaining > 0; i++) {
        const id = reader.u64String();
        const labelLength = reader.u32();
        const label = reader.ascii(labelLength);
        reader.skip(8);
        const parsed = parseDrillLabel(label);
        performers.push({
            id,
            label,
            drill_prefix: parsed.drill_prefix,
            drill_order: parsed.drill_order,
        });
    }
    return performers;
}

/**
 * A candidate byte layout for a `PTB7` set record. The record shape is
 * consistent within a file but drifts between exporter builds, so we detect it
 * per file instead of hard-coding one (see {@link readSetList}).
 */
interface SetLayout {
    /** Reserved bytes between the cumulative count and the title length. */
    skip: number;
    /** Width of the title length prefix. */
    title: 1 | 2;
    /** Width of the move-note length prefix. */
    note1: 1 | 2 | 4;
    /** Width of the secondary-note length prefix; 0 when the field is absent. */
    note2: 0 | 1 | 2 | 4;
    /**
     * Further note slots beyond the second, each prefixed like `note2`. Exports
     * carry up to five (`PTU1` names them `Note 1`…`Note 5`); most sets fill only
     * the first one or two, so the extra slots are usually empty.
     */
    extraNotes: number;
    /** Reserved bytes after the notes. */
    trailer: number;
}

/**
 * The subset marker sits a fixed distance from a record's end (5 bytes),
 * regardless of how the reserved bytes are split between `skip` and `trailer`.
 * Reading it from the end makes detection robust to that ambiguity.
 */
const SUBSET_MARKER_FROM_END = 5;

const PRINTABLE = /^[\x20-\x7e]*$/;
/** Control bytes that never appear in human-authored notes (tab/LF/CR allowed). */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0e-\x1f]/;

/**
 * `PTB7`: `u16 version, u16 count`, then `count` set records:
 * `u64 id, u16 cumulativeCount, skip, titleLen, title, note1Len, note1,
 *  [note2Len, note2], trailer`.
 *
 * The record shape drifts between Pyware exporter builds — and occasionally
 * *within* a single file (a draft that starts with one shape and switches when
 * the first measure-range title appears). `version` does not identify the
 * shape. Detection is two-stage:
 *
 * 1. **Uniform tiling** — try every shape in a small grid; keep the one that
 *    reads the most records / recovers the most text. A complete tiling (all
 *    `count` records, payload consumed) wins immediately.
 * 2. **Resume + adapt** — if the best shape dies mid-file, replay it for the
 *    head and, from the failure point, pick a fresh shape per remaining record
 *    (preferring continuity, requiring the successor's cumulative count to stay
 *    monotonic). The resume is kept only when it finishes the file or recovers
 *    more real text than the uniform head alone.
 *
 * The subset marker is the byte {@link SUBSET_MARKER_FROM_END} bytes before each
 * record's end: `1` means the *next* set is a labeled subset (a hold like
 * `12A`). Reading it from the record end is invariant to the skip/trailer split.
 *
 * The leading placeholder set (nameless, no note, count 0) is dropped — it maps
 * to OpenMarch's own page-0 anchor. Other nameless sets are kept: some exports
 * label every set only by its note.
 */
export function readSetList(payload: Uint8Array): ParsedSet[] {
    const reader = new BinaryReader(payload);
    if (reader.remaining < 4) return [];
    reader.u16(); // version — unreliable as a layout key (see above)
    const count = reader.u16();
    if (count <= 0 || count > 10_000) return [];
    const body = payload.subarray(reader.position);

    let best: { result: TileResult; layout: SetLayout } | undefined;
    let bestEmpty: TileResult | undefined;
    let anyText = false;
    for (const layout of layoutCandidates()) {
        const r = tileSetRecords(body, count, layout);
        if (!r) continue;
        if (r.score > 0) anyText = true;
        if (!best || rank(r) > rank(best.result)) best = { result: r, layout };
        if (r.complete && (!bestEmpty || r.parsed > bestEmpty.parsed)) {
            bestEmpty = r;
        }
    }
    if (!best) return [];

    // Some shows carry no set titles or notes at all, so every tiling scores
    // zero and `rank` cannot prefer a complete one (a zero-score "complete"
    // tiling is normally a truncated payload being eaten as empty records).
    // When *nothing* anywhere recovered text, that ambiguity is absent: take the
    // tiling that actually consumes the payload.
    if (!anyText && bestEmpty) return dropLeadingAnchor(bestEmpty.sets);

    if (best.result.complete) return dropLeadingAnchor(best.result.sets);

    // Mid-file shape switch: keep the best uniform head, then adapt the tail.
    // Only trust the resume when it finishes the file or recovers more real text
    // — otherwise a truncated payload's leftover bytes can fake empty records.
    const adapted = resumeAfterTile(body, count, best.layout);
    if (
        adapted &&
        rank(adapted) > rank(best.result) &&
        (adapted.complete || adapted.score > best.result.score)
    ) {
        return dropLeadingAnchor(adapted.sets);
    }
    return dropLeadingAnchor(best.result.sets);
}

/**
 * Drops the leading page-0 anchor, folding its note into the set that takes its
 * place.
 *
 * A set's formation sits at the *previous* record's cumulative count (§4), so a
 * leading record whose own count is 0 puts its formation and the next set's
 * both at count 0 — two pages on the same beat, and every later page carrying
 * the wrong label. That record is the source's page-0 anchor and maps onto
 * OpenMarch's own first page rather than a page of its own.
 *
 * The anchor is identified by **position and count only**, never by looking
 * nameless: exports of a show's later parts name it after the formation carried
 * in from the previous part (`36A`, `8A`, `8`, `A`), and some name it `"0"` or
 * leave it blank with a stray `"0"` note. Its note is real staging guidance for
 * the opening formation, so it is prepended to the surviving set rather than
 * discarded.
 */
function dropLeadingAnchor(sets: ParsedSet[]): ParsedSet[] {
    if (sets.length < 2) return sets;
    const [anchor, next, ...rest] = sets as [
        ParsedSet,
        ParsedSet,
        ...ParsedSet[],
    ];
    if (anchor.cumulativeCount !== 0) return sets;

    const notes = [anchor.notes, next.notes].filter(Boolean).join("\n\n");
    return [{ ...next, notes: notes || undefined }, ...rest];
}

/** Every shape the detector tries for a single `PTB7` record. */
function* layoutCandidates(): Generator<SetLayout> {
    for (let skip = 0; skip <= 10; skip++)
        for (const title of [2, 1] as const)
            for (const note1 of [4, 2, 1] as const)
                for (const note2 of [2, 4, 1, 0] as const)
                    // `PTU1` names five note slots; a record can carry any
                    // number of the later ones, usually empty.
                    for (
                        let extraNotes = 0;
                        extraNotes <= (note2 ? 3 : 0);
                        extraNotes++
                    )
                        // Trailers below 8 only appear in misaligned fakes; real
                        // exports use ~12–16 reserved bytes after the notes.
                        for (let trailer = 8; trailer <= 20; trailer++)
                            yield {
                                skip,
                                title,
                                note1,
                                note2,
                                extraNotes,
                                trailer,
                            };
}

interface TileResult {
    sets: ParsedSet[];
    /** Records parsed before running out of payload. */
    parsed: number;
    /** Whole payload consumed as exactly `count` records. */
    complete: boolean;
    /** Weighted length of the genuine names/notes recovered. */
    score: number;
}

/**
 * Ranks a tiling for layout selection. A complete tiling that recovered real
 * text beats everything; complete tilings that recovered nothing are treated as
 * suspicious (trailer=0 layouts can fake-consume a truncated payload as many
 * empty records). Otherwise more records win, then more recovered text.
 */
function rank(r: TileResult): number {
    if (r.complete && r.score > 0) return 1e12 + r.parsed * 1e6 + r.score;
    if (r.complete) return r.parsed * 1e3 + r.score;
    // Among partial tilings, recovered text is the stronger signal: a misaligned
    // shape with small records can always tile *more* records out of the same
    // bytes, but only the right one reads set names back out of them.
    return r.score * 1e6 + r.parsed;
}

const meaningful = (s: string) =>
    s.length > 0 && PRINTABLE.test(s) && /[A-Za-z0-9]/.test(s);

interface ParsedRecord {
    set: ParsedSet;
    cumulativeCount: number;
    end: number;
    score: number;
    layout: SetLayout;
}

/**
 * Tries to read one set record at `start` under `layout`. Returns undefined when
 * the shape misaligns. `allowTruncatedTrailer` is true only for the final record.
 */
function parseOneRecord(
    body: Uint8Array,
    start: number,
    lastCum: number,
    layout: SetLayout,
    allowTruncatedTrailer: boolean,
): ParsedRecord | undefined {
    const reader = new BinaryReader(body);
    reader.seek(start);
    const readLen = (w: 1 | 2 | 4): number =>
        w === 1 ? reader.slice(1)[0]! : w === 2 ? reader.u16() : reader.u32();

    if (reader.remaining < 10 + layout.skip) return undefined;
    const id = reader.u64String();
    const cumulativeCount = reader.u16();
    if (cumulativeCount < lastCum || cumulativeCount > 10_000) return undefined;
    reader.skip(layout.skip);

    if (reader.remaining < layout.title) return undefined;
    const titleLength = readLen(layout.title);
    if (titleLength > 64 || titleLength > reader.remaining) return undefined;
    const name = reader.ascii(titleLength);
    if (!PRINTABLE.test(name)) return undefined;

    if (reader.remaining < layout.note1) return undefined;
    const note1Length = readLen(layout.note1);
    if (note1Length > reader.remaining) return undefined;
    const note1 = reader.utf8(note1Length);
    if (note1Length > 0 && CONTROL.test(note1)) return undefined;

    const laterNotes: string[] = [];
    if (layout.note2) {
        for (let slot = 0; slot <= layout.extraNotes; slot++) {
            if (reader.remaining < layout.note2) return undefined;
            const noteLength = readLen(layout.note2);
            if (noteLength > reader.remaining) return undefined;
            const note = reader.utf8(noteLength);
            if (noteLength > 0 && CONTROL.test(note)) return undefined;
            laterNotes.push(note);
        }
    }

    let subsetFollows = false;
    if (reader.remaining < layout.trailer) {
        if (!allowTruncatedTrailer) return undefined;
    } else {
        reader.slice(layout.trailer);
        const end = reader.position;
        subsetFollows =
            end >= SUBSET_MARKER_FROM_END &&
            body[end - SUBSET_MARKER_FROM_END] === 1;
    }

    let score = 0;
    if (meaningful(name)) score += name.length * 10;
    if (meaningful(note1)) score += note1.length;
    for (const note of laterNotes) if (meaningful(note)) score += note.length;

    const notes = [note1, ...laterNotes]
        .filter((n) => n.length > 0)
        .join("\n\n");
    // Whether the leading record is a page-0 anchor is decided once, over the
    // whole list, in `dropLeadingAnchor` — it depends on position, not content.
    const set = {
        id,
        name,
        cumulativeCount,
        notes: notes || undefined,
        subsetFollows,
    };
    return { set, cumulativeCount, end: reader.position, score, layout };
}

/** Peek the cumulative count of the record that would start at `pos`, if any. */
function peekCum(body: Uint8Array, pos: number): number | undefined {
    if (pos + 10 > body.length) return undefined;
    return (body[pos + 8]! << 8) | body[pos + 9]!;
}

/**
 * Attempts to parse the `PTB7` body as `count` records under one
 * {@link SetLayout}. Returns the records parsed (possibly a truncated head) with
 * completeness and a text score, or `undefined` when the layout misaligns on the
 * very first record.
 */
function tileSetRecords(
    body: Uint8Array,
    count: number,
    layout: SetLayout,
): TileResult | undefined {
    const sets: ParsedSet[] = [];
    let score = 0;
    let lastCum = -1;
    let parsed = 0;
    let pos = 0;

    for (let i = 0; i < count; i++) {
        const rec = parseOneRecord(body, pos, lastCum, layout, i === count - 1);
        if (!rec) {
            return parsed === 0
                ? undefined
                : { sets, parsed, complete: false, score };
        }
        pos = rec.end;
        lastCum = rec.cumulativeCount;
        score += rec.score;
        parsed++;
        sets.push(rec.set);
    }

    return { sets, parsed, complete: body.length - pos <= 2, score };
}

/** Extra weight for a record that reuses the layout of the record before it. */
const CONTINUITY_BONUS = 4;
/**
 * Replays `headLayout` until it fails, then searches for a per-record layout
 * assignment over the remaining records.
 *
 * Records that carry a real title can be framed differently from their empty
 * neighbors (two reserved bytes move from the record's tail to its head), and
 * the file switches back afterwards — so this is a per-record variation, not a
 * one-way mid-file switch.
 *
 * Choosing greedily does not work: consecutive empty records admit many layouts
 * whose end offsets differ by a byte or two, all scoring zero, and picking the
 * wrong one only becomes visible several records later. The search therefore
 * treats "consumes the whole payload in exactly `count` records" as the
 * acceptance test, backtracking when a prefix leads nowhere, and among the
 * assignments that survive prefers the one recovering the most text (with a nudge
 * toward keeping the layout stable between adjacent records).
 */
function resumeAfterTile(
    body: Uint8Array,
    count: number,
    headLayout: SetLayout,
): TileResult | undefined {
    const head: ParsedRecord[] = [];
    let lastCum = -1;
    let pos = 0;

    for (let i = 0; i < count; i++) {
        const rec = parseOneRecord(
            body,
            pos,
            lastCum,
            headLayout,
            i === count - 1,
        );
        if (!rec) break;
        head.push(rec);
        pos = rec.end;
        lastCum = rec.cumulativeCount;
    }

    const tail = searchRecords(body, count, head.length, pos, lastCum);
    const records = tail ? [...head, ...tail] : head;
    const sets = records.map((r) => r.set);
    const score = records.reduce((total, r) => total + r.score, 0);
    const end = records.length ? records[records.length - 1]!.end : 0;
    return {
        sets,
        parsed: records.length,
        complete: records.length === count && body.length - end <= 2,
        score,
    };
}

/**
 * Finds the highest-scoring way to read records `from`..`count - 1` starting at
 * `pos` such that the payload ends up fully consumed. Returns undefined when no
 * assignment does. Memoized on the search state, so the branching over layouts
 * stays bounded even on long set lists.
 */
function searchRecords(
    body: Uint8Array,
    count: number,
    from: number,
    pos: number,
    lastCum: number,
): ParsedRecord[] | undefined {
    const memo = new Map<string, ParsedRecord[] | undefined>();

    const walk = (
        i: number,
        at: number,
        cum: number,
        prev: SetLayout | undefined,
    ): ParsedRecord[] | undefined => {
        if (i === count) return body.length - at <= 2 ? [] : undefined;

        const key = `${i}:${at}:${cum}`;
        const cached = memo.get(key);
        if (cached !== undefined || memo.has(key)) {
            // Cached without the continuity nudge; it only breaks ties.
            return cached;
        }

        let best: ParsedRecord[] | undefined;
        let bestScore = -1;
        for (const rec of candidateRecords(body, at, cum, i === count - 1)) {
            const rest = walk(i + 1, rec.end, rec.cumulativeCount, rec.layout);
            if (!rest) continue;
            const continuity =
                prev && sameLayout(prev, rec.layout) ? CONTINUITY_BONUS : 0;
            const total =
                rec.score +
                continuity +
                rest.reduce((sum, r) => sum + r.score, 0);
            if (total > bestScore) {
                bestScore = total;
                best = [rec, ...rest];
            }
        }
        memo.set(key, best);
        return best;
    };

    return walk(from, pos, lastCum, undefined);
}

/**
 * Every distinct way to read one record at `pos`, keyed by where it ends: layouts
 * that agree on the end offset are interchangeable for the walk, so only the
 * best-scoring one of each is kept.
 */
function candidateRecords(
    body: Uint8Array,
    pos: number,
    lastCum: number,
    last: boolean,
): ParsedRecord[] {
    const byEnd = new Map<number, ParsedRecord>();
    for (const layout of layoutCandidates()) {
        const rec = parseOneRecord(body, pos, lastCum, layout, last);
        if (!rec) continue;
        if (!last) {
            const nextCum = peekCum(body, rec.end);
            if (
                nextCum === undefined ||
                nextCum < rec.cumulativeCount ||
                nextCum > 10_000
            )
                continue;
        }
        const existing = byEnd.get(rec.end);
        if (!existing || rec.score > existing.score) byEnd.set(rec.end, rec);
    }
    return [...byEnd.values()];
}

function sameLayout(a: SetLayout, b: SetLayout): boolean {
    return (
        a.skip === b.skip &&
        a.title === b.title &&
        a.note1 === b.note1 &&
        a.note2 === b.note2 &&
        a.extraNotes === b.extraNotes &&
        a.trailer === b.trailer
    );
}

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;

/**
 * `GRD1`: a count-prefixed list of length-prefixed ASCII tokens describing the
 * grid. We read the tokens needed to convert coordinates into real steps and to
 * reconstruct the field:
 *
 * - `BORD minX minY maxX maxY` — the field rectangle (source units).
 * - `GRID hStep hUnit vStep vUnit …` — steps per unit on each axis.
 * - `HZMJ y` — horizontal major line (a sideline).
 * - `HZHS y` — hash line.
 * - `VTMJ x` — vertical major line (a yard line).
 * - `UNIT a b` — measurement system (0 = imperial, non-zero = metric).
 * - `CTITL path` — the grid template file the drill was designed on.
 * - `SRFC path` — the field-surface image.
 */
function readGrid(payload: Uint8Array): DrillGrid | undefined {
    const text = new BinaryReader(payload).ascii(payload.length);

    const border = matchBorder(text);
    if (!border) return undefined;

    const grid = text.match(
        new RegExp(`GRID\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}`),
    );
    const stepsPerUnitX = grid ? ratio(grid[1]!, grid[2]!) : 1;
    const stepsPerUnitY = grid ? ratio(grid[3]!, grid[4]!) : 1;

    const unit = text.match(new RegExp(`UNIT\\s+${NUM}`));
    const measurementSystem =
        unit && parseFloat(unit[1]!) !== 0 ? "metric" : "imperial";

    return {
        border,
        stepsPerUnitX,
        stepsPerUnitY,
        sidelinesY: collectValues(text, "HZMJ"),
        hashesY: collectValues(text, "HZHS"),
        yardLinesX: collectValues(text, "VTMJ"),
        measurementSystem,
        templateName: baseName(matchPath(text, "CTITL")),
        surfaceImageName: matchPath(text, "SRFC")?.split(/[\\/]/).pop(),
    };
}

function matchBorder(text: string): DrillFieldBorder | undefined {
    const match = text.match(
        new RegExp(`BORD\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}`),
    );
    if (!match) return undefined;
    return {
        minX: parseFloat(match[1]!),
        minY: parseFloat(match[2]!),
        maxX: parseFloat(match[3]!),
        maxY: parseFloat(match[4]!),
    };
}

/** Ratio of two numeric strings, guarding against a zero/invalid denominator. */
function ratio(numerator: string, denominator: string): number {
    const d = parseFloat(denominator);
    return d !== 0 ? parseFloat(numerator) / d : 1;
}

/** All leading numeric values for a repeated single-value token (e.g. `HZMJ`). */
function collectValues(text: string, token: string): number[] {
    const values: number[] = [];
    const pattern = new RegExp(`${token}\\s+${NUM}`, "g");
    for (const match of text.matchAll(pattern)) {
        values.push(parseFloat(match[1]!));
    }
    return values;
}

/**
 * The path argument of a token whose value is an unquoted file path. Tokens are
 * separated by control bytes, so a run of printable ASCII captures the whole
 * path and stops at the next token's length/separator byte.
 */
function matchPath(text: string, token: string): string | undefined {
    // eslint-disable-next-line no-control-regex
    const match = text.match(new RegExp(`${token}[\\x20-\\x7e]+`));
    if (!match) return undefined;
    const value = match[0].slice(token.length).trim();
    return value || undefined;
}

/** The file's base name without extension, e.g. `".../default.grd"` -> `"default"`. */
function baseName(path: string | undefined): string | undefined {
    if (!path) return undefined;
    const file = path.split(/[\\/]/).pop() ?? path;
    return file.replace(/\.[^.]+$/, "") || undefined;
}

/**
 * Joins the named set list to the per-count page frames. Each named set is
 * reached at a specific cumulative count; the page frame at that count holds
 * the set's formation. Cast members and discovered props are kept.
 *
 * A set is marked `isSubset` from the source's own marker: the previous set's
 * {@link ParsedSet.subsetFollows} flag. This matches source page numbering like
 * `1`, `1A`, `2`, and — unlike a geometry heuristic — catches labeled holds
 * that still contain movement.
 *
 * Every set (including the last) carries a cumulative count. For non-final sets
 * that count is the next set's start; the final set's count marks one more
 * formation the source reaches afterward — a closing page/hold that has no
 * record of its own. We emit it too, so the imported page list matches the
 * source's. Its type follows the same rule: it is a subset when the final named
 * set is flagged (a closing hold like `15A`), and a plain page otherwise.
 */
function buildSets(
    parsedSets: ParsedSet[],
    pages: PageFrame[],
    markerIds: Set<string>,
): DrillSet[] {
    if (parsedSets.length === 0 || pages.length === 0) return [];

    const boundaries = deriveSetStartCounts(parsedSets, pages.length);
    const sets: DrillSet[] = [];
    for (let i = 0; i < parsedSets.length; i++) {
        const parsed = parsedSets[i]!;
        const startCount = boundaries[i]!;
        const previousStart = i === 0 ? 0 : boundaries[i - 1]!;
        sets.push({
            name: parsed.name,
            startCount,
            counts: i === 0 ? 0 : startCount - previousStart,
            // First page is permanently non-subset in OpenMarch (SQLite trigger);
            // otherwise the source flags a subset on the *previous* set.
            isSubset: i > 0 && parsedSets[i - 1]!.subsetFollows,
            notes: parsed.notes,
            coordinates: pickCoordinates(pages, startCount, markerIds),
        });
    }

    const lastParsed = parsedSets[parsedSets.length - 1]!;
    const lastStart = boundaries[boundaries.length - 1]!;
    const trailingStart = Math.min(
        lastParsed.cumulativeCount,
        pages.length - 1,
    );
    if (trailingStart > lastStart) {
        sets.push({
            name: "",
            startCount: trailingStart,
            counts: trailingStart - lastStart,
            isSubset: lastParsed.subsetFollows,
            notes: undefined,
            coordinates: pickCoordinates(pages, trailingStart, markerIds),
        });
    }
    return sets;
}

/** Marker positions at a given count, restricted to known markers. */
function pickCoordinates(
    pages: PageFrame[],
    count: number,
    markerIds: Set<string>,
): Record<string, DrillPoint> {
    const frame = pages[Math.min(count, pages.length - 1)]!;
    const coordinates: Record<string, DrillPoint> = {};
    for (const [id, record] of frame.records) {
        if (markerIds.has(id)) coordinates[id] = record.point;
    }
    return coordinates;
}

/**
 * The set list stores a running count for each set. The first set sits at count
 * 0 and subsequent sets at the previous cumulative value, giving the page-frame
 * index that holds each set's formation.
 */
function deriveSetStartCounts(
    parsedSets: ParsedSet[],
    pageCount: number,
): number[] {
    const starts: number[] = [0];
    for (let i = 1; i < parsedSets.length; i++) {
        const value = parsedSets[i - 1]!.cumulativeCount;
        starts.push(Math.min(value, pageCount - 1));
    }
    return starts;
}
