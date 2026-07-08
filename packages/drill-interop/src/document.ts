import { BinaryReader } from "./binaryReader";
import { decodeCoordinateBlock } from "./crypto";
import type {
    DrillFieldBorder,
    DrillPerformer,
    DrillPoint,
    DrillSet,
} from "./types";
import { parseDrillLabel } from "./label";
import { discoverMarkers, type CoordinateRecord } from "./props";

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
    /** Total number of counts (page frames) in the show. */
    totalCounts: number;
}

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
    let field: DrillFieldBorder = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
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
                field = readFieldBorder(payload) ?? field;
                break;
            default:
                // Unhandled chunk (colors, playlist, etc.) — skipped.
                break;
        }

        // Pages always follow the metadata chunks; once we've seen them and hit
        // an unrelated chunk, the drill body is done.
        if (rawPages.length > 0) break;
    }

    const pages = await Promise.all(rawPages.map(decodePageFrame));
    const castIds = new Set(performers.map((p) => p.id));
    const boundaries = deriveSetStartCounts(parsedSets, pages.length);
    const { props, supplemental } = discoverMarkers(
        pages,
        castIds,
        field,
        boundaries,
    );
    const markerIds = new Set([
        ...castIds,
        ...props.map((p) => p.id),
        ...supplemental.map((p) => p.id),
    ]);
    const sets = buildSets(parsedSets, pages, markerIds);
    return {
        title,
        performers,
        props,
        supplemental,
        sets,
        field,
        totalCounts: pages.length,
    };
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
    return reader.ascii(length) || undefined;
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
 * `PTB7`: a 4-byte header, then repeated records of
 * `u64 id, u16 cumulativeCount, 3 reserved, u16 titleLen, title,
 *  i32 noteLen, note, 16 reserved`.
 */
function readSetList(payload: Uint8Array): ParsedSet[] {
    const reader = new BinaryReader(payload);
    reader.skip(4);
    const sets: ParsedSet[] = [];
    while (reader.remaining >= 8) {
        const id = reader.u64String();
        const cumulativeCount = reader.u16();
        reader.skip(3);
        const titleLength = reader.u16();
        if (titleLength === 0 || titleLength > 64) break;
        if (reader.remaining < titleLength) break;
        const name = reader.ascii(titleLength);
        const noteLength = reader.u32();
        if (noteLength > reader.remaining) break;
        const note = reader.ascii(noteLength);
        reader.skip(16);
        sets.push({
            id,
            name,
            cumulativeCount,
            notes: note.length > 0 ? note : undefined,
        });
    }
    return sets;
}

/**
 * `GRD1`: a count-prefixed list of length-prefixed ASCII tokens. We only need
 * the `BORD minX minY maxX maxY` token, which defines the field rectangle.
 */
function readFieldBorder(payload: Uint8Array): DrillFieldBorder | undefined {
    const text = new BinaryReader(payload).ascii(payload.length);
    const match = text.match(
        /BORD\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/,
    );
    if (!match) return undefined;
    return {
        minX: parseFloat(match[1]!),
        minY: parseFloat(match[2]!),
        maxX: parseFloat(match[3]!),
        maxY: parseFloat(match[4]!),
    };
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
