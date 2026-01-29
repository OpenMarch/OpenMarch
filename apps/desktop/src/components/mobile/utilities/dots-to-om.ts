/**
 * Converts the current .dots database (via persistent ORM connection) to OpenMarch schema format.
 * Uses getOrmConnection() — throws "Db is not open" if no show is open.
 */

import { asc } from "drizzle-orm";
import {
    formatValidationErrors,
    SCHEMA_VERSION,
    safeValidateOpenMarchData,
    type OpenMarchSchemaType,
    toOpenMarchFile,
} from "@openmarch/schema";
import { FieldProperties } from "@openmarch/core";
import { DB, schema } from "@/global/database/db";
import { FieldPropertiesSchema } from "@/components/field/fieldPropertiesSchema";

type TimingRow = {
    position: number;
    duration: number;
    timestamp: number;
    beat_id: number;
    page_id: number | null;
    measure_id: number | null;
};
type PageRow = typeof schema.pages.$inferSelect;
type MeasureRow = typeof schema.measures.$inferSelect;
type MarcherPageRow = typeof schema.marcher_pages.$inferSelect;

// -----------------------------------------------------------------------------
// Helpers: field properties → PerformanceArea, coordinates
// -----------------------------------------------------------------------------

function fieldPropsToPerformanceArea(fieldProperties: FieldProperties) {
    const xCheckpoints = fieldProperties.xCheckpoints.map((cp) => ({
        name: cp.name,
        terseName: cp.terseName,
        useAsReference: cp.useAsReference,
        fieldLabel: cp.fieldLabel,
        visible: cp.visible,
        stepsFromCenter: cp.stepsFromCenterFront,
    }));
    const yCheckpoints = fieldProperties.yCheckpoints.map((cp) => ({
        name: cp.name,
        terseName: cp.terseName,
        useAsReference: cp.useAsReference,
        fieldLabel: cp.fieldLabel,
        visible: cp.visible,
        stepsFromYOrigin: -cp.stepsFromCenterFront,
    }));
    const minX = Math.min(...xCheckpoints.map((c) => c.stepsFromCenter));
    const maxX = Math.max(...xCheckpoints.map((c) => c.stepsFromCenter));
    const minY = Math.min(...yCheckpoints.map((c) => c.stepsFromYOrigin));
    const maxY = Math.max(...yCheckpoints.map((c) => c.stepsFromYOrigin));
    const widthInches = (maxX - minX) * fieldProperties.stepSizeInches;
    const heightInches = (maxY - minY) * fieldProperties.stepSizeInches;
    return {
        yOrigin: "front" as const,
        inchesPerStep: fieldProperties.stepSizeInches,
        xCheckpoints,
        yCheckpoints,
        widthFeet: widthInches / 12,
        heightFeet: heightInches / 12,
        useHashes: fieldProperties.useHashes ?? true,
    };
}

function getFieldExtentsSteps(fieldProperties: FieldProperties) {
    const minX = Math.min(
        ...fieldProperties.xCheckpoints.map((c) => c.stepsFromCenterFront),
    );
    const maxX = Math.max(
        ...fieldProperties.xCheckpoints.map((c) => c.stepsFromCenterFront),
    );
    const minY = Math.min(
        ...fieldProperties.yCheckpoints.map((c) => c.stepsFromCenterFront),
    );
    const maxY = Math.max(
        ...fieldProperties.yCheckpoints.map((c) => c.stepsFromCenterFront),
    );
    return {
        fieldWidthSteps: maxX - minX,
        fieldHeightSteps: Math.abs(maxY - minY),
    };
}

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
    for (let i = 1; i < rows.length; i++) {
        if (Math.abs(rows[i].duration - curDuration) < 1e-6) count++;
        else {
            out.push({ tempo: 60 / curDuration, numberOfBeats: count });
            curDuration = rows[i].duration;
            count = 1;
        }
    }
    out.push({ tempo: 60 / curDuration, numberOfBeats: count });
    return out;
}

function buildCoordinates({
    marcherPagesRows,
    centerXPixels,
    fieldHeightSteps,
    pixelsPerStep,
}: {
    marcherPagesRows: MarcherPageRow[];
    centerXPixels: number;
    fieldHeightSteps: number;
    pixelsPerStep: number;
}): {
    marcherId: string;
    pageId: string;
    xSteps: number;
    ySteps: number;
    rotation_degrees?: number;
}[] {
    return marcherPagesRows.map((mp) => {
        const coord: {
            marcherId: string;
            pageId: string;
            xSteps: number;
            ySteps: number;
            rotation_degrees?: number;
        } = {
            marcherId: String(mp.marcher_id),
            pageId: String(mp.page_id),
            xSteps: (mp.x - centerXPixels) / pixelsPerStep,
            ySteps: fieldHeightSteps - mp.y / pixelsPerStep,
        };
        if (mp.rotation_degrees != null && mp.rotation_degrees !== 0)
            coord.rotation_degrees = mp.rotation_degrees;
        return coord;
    });
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

    const [
        fieldPropsRow,
        marchersRows,
        pagesRows,
        measuresRows,
        marcherPagesRows,
    ] = await Promise.all([
        db.query.field_properties.findFirst({ columns: { json_data: true } }),
        db.query.marchers.findMany({
            orderBy: [
                asc(schema.marchers.drill_prefix),
                asc(schema.marchers.drill_order),
            ],
            columns: {
                id: true,
                drill_prefix: true,
                drill_order: true,
                section: true,
                // STUDENT PRIVACY - these columns are omitted and never pushed to server
                name: false,
                year: false,
                notes: false,
            },
        }),
        db.query.pages.findMany(),
        db.query.measures.findMany(),
        db.query.marcher_pages.findMany(),
    ]);

    return {
        timingRows,
        fieldPropsRow,
        marchersRows,
        pagesRows,
        measuresRows,
        marcherPagesRows,
    };
}

function buildOpenMarchFromRows(
    data: Awaited<ReturnType<typeof fetchDotsData>>,
): OpenMarchSchemaType {
    const {
        timingRows,
        fieldPropsRow,
        marchersRows,
        pagesRows,
        measuresRows,
        marcherPagesRows,
    } = data;

    if (!fieldPropsRow) {
        throw new Error("Field properties not found");
    }

    const fieldProps: FieldProperties = new FieldProperties(
        FieldPropertiesSchema.parse(JSON.parse(fieldPropsRow.json_data)),
    );
    const pixelsPerStep = fieldProps.pixelsPerStep;
    const performanceArea = fieldPropsToPerformanceArea(fieldProps);
    const { fieldWidthSteps, fieldHeightSteps } =
        getFieldExtentsSteps(fieldProps);
    const centerXPixels = (fieldWidthSteps / 2) * pixelsPerStep;

    const metadata = {
        performanceArea,
        createdAtUtc:
            timingRows.length > 0
                ? new Date(timingRows[0].timestamp * 1000).toISOString()
                : new Date().toISOString(),
    };

    const performers = marchersRows.map((m) => ({
        id: m.id,
        label: `${m.drill_prefix}${m.drill_order}`,
        section: m.section,
    }));

    const pagesById = new Map<number, PageRow>(
        pagesRows.map((p: PageRow) => [p.id, p]),
    );
    const measuresById = new Map<number, MeasureRow>(
        measuresRows.map((m: MeasureRow) => [m.id, m]),
    );

    const pages = buildPagesFromTiming({ timingRows, pagesById });
    const tempoSections = buildTempoSections(timingRows);
    const coordinates = buildCoordinates({
        marcherPagesRows,
        centerXPixels,
        fieldHeightSteps,
        pixelsPerStep,
    });
    const measures = buildMeasuresFromTiming({ timingRows, measuresById });

    return {
        omSchemaVersion: SCHEMA_VERSION,
        metadata,
        performers,
        pages,
        tempoSections,
        coordinates,
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
export async function toOpenMarchSchema(db: DB): Promise<OpenMarchSchemaType> {
    const data = await fetchDotsData(db);
    const obj = buildOpenMarchFromRows(data);

    const result = safeValidateOpenMarchData(obj);
    if (!result.success) {
        const msgs = formatValidationErrors(result.error);
        throw new Error(
            `OpenMarch schema validation failed:\n${msgs.join("\n")}`,
        );
    }
    return result.data;
}

/**
 * Converts the current .dots database to a compressed OpenMarch file.
 * Uses the persistent ORM connection from getOrmConnection().
 *
 * @returns Compressed OpenMarch file bytes
 * @throws "Db is not open" if no show is open
 * @throws ZodError (or formatted error) if built data fails schema validation
 */
export async function toCompressedOpenMarchBytes(db: DB): Promise<Uint8Array> {
    const schema = await toOpenMarchSchema(db);
    return toOpenMarchFile(schema, { compressed: true });
}
