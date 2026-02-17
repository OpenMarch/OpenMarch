/**
 * Converts the current .dots database (via persistent ORM connection) to OpenMarch schema format.
 * Uses getOrmConnection() — throws "Db is not open" if no show is open.
 */

import { asc } from "drizzle-orm";
import {
    formatValidationErrors,
    SCHEMA_VERSION,
    type OpenMarchTempoData,
    safeValidateOpenMarchTempoData,
} from "@openmarch/schema";
import { DB, schema } from "@/global/database/db";

type TimingRow = typeof schema.timing_objects.$inferSelect;
type PageRow = typeof schema.pages.$inferSelect;
type MeasureRow = typeof schema.measures.$inferSelect;

function buildPagesFromTiming({
    timingRows,
    pagesById,
}: {
    timingRows: TimingRow[];
    pagesById: Map<number, PageRow>;
}): {
    id: string;
    duration: number;
    startBeatIndex: number;
    name: string;
    isSubset?: boolean;
}[] {
    const pageTimingRows = timingRows.filter(
        (r): r is TimingRow & { page_id: number } => r.page_id != null,
    );
    return pageTimingRows.map((row, idx) => {
        const startPosition = row.position;
        const nextPageRow = pageTimingRows[idx + 1];
        const endPosition = nextPageRow
            ? nextPageRow.position
            : timingRows.length;
        let duration = 0;
        for (let i = 0; i < timingRows.length; i++) {
            const p = timingRows[i].position;
            if (p >= startPosition && p < endPosition)
                duration += timingRows[i].duration;
        }
        const pageRec = pagesById.get(row.page_id);
        return {
            id: String(row.page_id),
            duration,
            startBeatIndex: row.position,
            name: `Page ${idx + 1}`,
            ...(pageRec?.is_subset === 1 && { isSubset: true }),
        };
    });
}

/** Round to 3 decimal places to avoid floating-point noise in exported OMT. */
function roundTempoToThousandth(bpm: number): number {
    return Math.round(bpm * 1000) / 1000;
}

function buildTempoSections(
    timingRows: TimingRow[],
): { tempo: number; numberOfBeats: number }[] {
    // First beat is intended to have duration 0; skip zero/invalid durations so we never compute tempo = 60/0.
    const rows = timingRows.filter(
        (r) => r.duration > 0 && isFinite(r.duration),
    );
    const out: { tempo: number; numberOfBeats: number }[] = [];
    if (rows.length === 0) return out;
    let curDuration = rows[0].duration;
    let count = 1;

    out.push({
        tempo: 0, // No tempo for beat 0
        numberOfBeats: 1,
    });
    for (let i = 1; i < rows.length; i++) {
        if (Math.abs(rows[i].duration - curDuration) < 1e-6) count++;
        else {
            out.push({
                tempo: roundTempoToThousandth(60 / curDuration),
                numberOfBeats: count,
            });
            curDuration = rows[i].duration;
            count = 1;
        }
    }
    out.push({
        tempo: roundTempoToThousandth(60 / curDuration),
        numberOfBeats: count,
    });
    return out;
}

function buildMeasuresFromTiming({
    timingRows,
    measuresById,
}: {
    timingRows: TimingRow[];
    measuresById: Map<number, MeasureRow>;
}): { startBeatIndex: number; name: string; rehearsalMark?: string }[] {
    const measureTimingRows = timingRows.filter(
        (r): r is TimingRow & { measure_id: number } => r.measure_id != null,
    );
    return measureTimingRows.map((row, idx) => {
        const m = measuresById.get(row.measure_id);
        return {
            startBeatIndex: row.position,
            name: `Measure ${idx + 1}`,
            ...(m?.rehearsal_mark != null && {
                rehearsalMark: m.rehearsal_mark,
            }),
        };
    });
}

// -----------------------------------------------------------------------------
// Data fetch + schema build (keeps toOpenMarchSchema under max-lines)
// -----------------------------------------------------------------------------

async function fetchDotsData(db: DB) {
    const timingRows = (await db
        .select()
        .from(schema.timing_objects)
        .orderBy(asc(schema.timing_objects.position))) as TimingRow[];

    const [pagesRows, measuresRows] = await Promise.all([
        db.query.pages.findMany(),
        db.query.measures.findMany(),
    ]);

    return {
        timingRows,
        pagesRows,
        measuresRows,
    };
}

function buildOpenMarchFromRows(
    data: Awaited<ReturnType<typeof fetchDotsData>>,
): OpenMarchTempoData {
    const { timingRows, pagesRows, measuresRows } = data;

    const metadata = {
        createdAtUtc: new Date().toISOString(),
    };

    const pagesById = new Map<number, PageRow>(
        pagesRows.map((p: PageRow) => [p.id, p]),
    );
    const measuresById = new Map<number, MeasureRow>(
        measuresRows.map((m: MeasureRow) => [m.id, m]),
    );

    const pages = buildPagesFromTiming({ timingRows, pagesById });
    const tempoSections = buildTempoSections(timingRows);
    const measures = buildMeasuresFromTiming({ timingRows, measuresById });

    return {
        metadata,
        omSchemaVersion: SCHEMA_VERSION,
        pages,
        tempoSections,
        measures: measures.length > 0 ? measures : undefined,
    };
}

// -----------------------------------------------------------------------------
// toOpenMarchSchema
// -----------------------------------------------------------------------------

/**
 * Builds an OpenMarch schema object from the currently open .dots database.
 * Uses the persistent ORM connection from getOrmConnection().
 *
 * @returns Valid OpenMarchSchema object
 * @throws "Db is not open" if no show is open
 * @throws ZodError (or formatted error) if built data fails schema validation
 */
export async function toOpenMarchTempoData(
    db: DB,
): Promise<OpenMarchTempoData> {
    const data = await fetchDotsData(db);
    const obj = buildOpenMarchFromRows(data);

    const result = safeValidateOpenMarchTempoData(obj);
    if (!result.success) {
        const msgs = formatValidationErrors(result.error);
        throw new Error(
            `OpenMarch schema validation failed:\n${msgs.join("\n")}`,
        );
    }
    return result.data;
}
