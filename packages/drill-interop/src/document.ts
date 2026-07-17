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
    const last = sets.at(-1);
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
 * `PTB7`: `u16 version, u16 count`, then `count` records of
 * `u64 id, u16 cumulativeCount, 3 reserved, u16 titleLen, title,
 *  i32 noteLen, note, 16 reserved`.
 *
 * Some packages include a nameless leading placeholder set (`titleLen === 0`);
 * those are dropped. Older parsers treated `titleLen === 0` as end-of-list,
 * which skipped every set when the placeholder came first.
 */
export function readSetList(payload: Uint8Array): ParsedSet[] {
    const reader = new BinaryReader(payload);
    if (reader.remaining < 4) return [];
    reader.u16(); // version
    const count = reader.u16();
    if (count <= 0 || count > 10_000) return [];

    const sets: ParsedSet[] = [];
    for (let i = 0; i < count && reader.remaining >= 8; i++) {
        const id = reader.u64String();
        const cumulativeCount = reader.u16();
        reader.skip(3);
        const titleLength = reader.u16();
        if (titleLength > 64 || titleLength > reader.remaining) break;
        const name = titleLength > 0 ? reader.ascii(titleLength) : "";
        const noteLength = reader.u32();
        if (noteLength > reader.remaining) break;
        const note = reader.utf8(noteLength);
        reader.skip(16);
        if (name.length === 0) continue;
        sets.push({
            id,
            name,
            cumulativeCount,
            notes: note.length > 0 ? note : undefined,
        });
    }
    return sets;
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
        const frame = pages[Math.min(startCount, pages.length - 1)]!;

        const coordinates: Record<string, DrillPoint> = {};
        for (const [id, record] of frame.records) {
            if (markerIds.has(id)) coordinates[id] = record.point;
        }
        sets.push({
            name: parsed.name,
            startCount,
            counts: i === 0 ? 0 : startCount - previousStart,
            notes: parsed.notes,
            coordinates,
        });
    }
    return sets;
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
