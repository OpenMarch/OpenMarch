// @vitest-environment node
// cspell:ignore IHDR
/**
 * A v0.1.7 show with a field image keeps it where this build uses it. `v017-files/field-image.dots`
 * was made by v0.1.7's own Field settings (a template, Import Image, "fill", 40% opacity; see
 * `v017-files/README.md`). `v017Files.test.ts` checks the conversion keeps `field_properties` byte
 * for byte; this opens the file as the app does (convert on open), then reads it back through the
 * app's own reads and feeds the result to the code that draws it:
 * - the renderer's field-properties and field-image queries, over the main process's SQL handler;
 * - the 2D field's plan (`planField2d`), which the editor's field and the video export draw;
 * - the SVG export (`fieldSvg`, `generateDrillChartExportSVGs`) and the PDF export's main-process
 *   image (`PDFExportService`), which fills the SVG's image placeholder;
 * - the 3D View's field surface plan (`planField`), in its theme and tarp styles.
 *
 * Decoding the bytes (`createImageBitmap` in `useFieldImage`, `Image` in `getFieldImageForExport`)
 * and painting need a browser, so they aren't covered here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pixelsToWorld } from "@openmarch/core";
import * as DatabaseServices from "../database.services";
import type { ConvertOnOpenDialogs } from "@om-electron/main/convertOnOpenFlow";
import { openShowFile } from "@om-electron/main/openShow";
import { migrationsFolder } from "./convertOnOpenFixtures";
import {
    getFieldProperties,
    getFieldPropertiesImage,
} from "@/global/classes/FieldProperties";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { fieldImageQueryOptions } from "@/view3d/window/useFieldImage";
import { planField2d } from "@/field/fieldPlan";
import { fieldSvg } from "@/components/exporting/utils/drillChartSvg";
import {
    generateDrillChartExportSVGs,
    getFieldPropertiesImage as getExportFieldImage,
    OPENMARCH_FIELD_IMAGE_PLACEHOLDER,
} from "@/components/exporting/utils/svg-generator";
import { planField, type FieldImage } from "@/view3d/core/field";

vi.mock("electron", () => ({
    app: { getPath: () => os.tmpdir() },
    BrowserWindow: {},
    dialog: {},
    ipcMain: {},
    shell: {},
}));
vi.mock("electron-store", () => ({
    default: class {
        get() {}
        set() {}
    },
}));

const { PDFExportService } =
    await import("@om-electron/main/services/export-service");

const FIXTURE = path.resolve(__dirname, "v017-files", "field-image.dots");
const VIEW = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, "v017-files", "field-image.v017.json"),
        "utf-8",
    ),
) as {
    field: {
        jsonData: string;
        fieldProperties: Record<string, unknown>;
        image: { byteLength: number; sha256: string };
    };
};

/** The image v0.1.7 stored, read from the v0.1.7 file itself. */
function v017Image(): Uint8Array {
    const db = new DatabaseSync(FIXTURE, { readOnly: true });
    try {
        const row = db
            .prepare("SELECT image FROM field_properties WHERE id = 1")
            .get() as { image: Uint8Array };
        return new Uint8Array(row.image);
    } finally {
        db.close();
    }
}

/** A PNG's size, from its IHDR chunk. */
function pngSize(bytes: Uint8Array) {
    const buf = Buffer.from(bytes);
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const noDialogs: ConvertOnOpenDialogs = {
    whilePreparing: (work) => work(undefined),
    backupFailed: async () => {},
    conversionFailed: async () => {},
};

describe("a v0.1.7 show with a field image, opened in this build", () => {
    let tempDir: string;

    beforeEach(async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-v017-"));
        const showPath = path.join(tempDir, "field-image.dots");
        fs.copyFileSync(FIXTURE, showPath);
        const result = await openShowFile(
            showPath,
            false,
            { migrationsFolder, dialogs: () => noDialogs },
            { conversionConfirmed: true },
        );
        expect(result.status).toBe(200);
        result.db?.close();
        if (result.sqlSuspension !== undefined)
            DatabaseServices.resumeSqlProxy(result.sqlSuspension);
        // The renderer's SQL goes through the main process's handlers, as in the app
        (globalThis as unknown as { window: unknown }).window = {
            electron: {
                sqlProxy: (
                    sql: string,
                    params: unknown[],
                    method: "all" | "run" | "get" | "values",
                ) => DatabaseServices.handleSqlProxy(null, sql, params, method),
                sqlReadBatch: (queries: unknown) =>
                    DatabaseServices.handleSqlReadBatch(queries),
            },
        };
        PDFExportService.clearFieldImageCache();
    });

    afterEach(() => {
        delete (globalThis as { window?: unknown }).window;
        DatabaseServices.forceResumeSqlProxy();
        DatabaseServices.closePersistentConnection();
        DatabaseServices.setDbPath("", false);
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("reads back v0.1.7's image and field settings through the renderer's queries", async () => {
        const original = v017Image();
        expect(original.byteLength).toBe(VIEW.field.image.byteLength);

        const image = await getFieldPropertiesImage();
        expect(image && Buffer.from(image)).toEqual(Buffer.from(original));
        const queried = await fieldImageQueryOptions().queryFn!({} as never);
        expect(queried && Buffer.from(queried)).toEqual(Buffer.from(original));

        const fp = await fieldPropertiesQueryOptions().queryFn();
        expect(fp).toEqual(await getFieldProperties());
        // What v0.1.7 set in Field settings, read as v0.1.7 read it
        expect(fp).toMatchObject({
            name: "Indoor 50x80 - 6 to 5 Steps",
            showFieldImage: true,
            imageFillOrFit: "fill",
            backgroundImageOpacity: 0.4,
        });
        expect(VIEW.field.fieldProperties).toMatchObject({
            name: fp.name,
            showFieldImage: true,
            imageFillOrFit: "fill",
            backgroundImageOpacity: 0.4,
        });
        // Every setting v0.1.7 had comes back the same
        const now = JSON.parse(JSON.stringify(fp)) as Record<string, unknown>;
        for (const [key, value] of Object.entries(VIEW.field.fieldProperties))
            expect(now[key], key).toEqual(value);
    });

    it("draws the image on the 2D field, filled and at 40% opacity", async () => {
        const fp = await getFieldProperties();
        const size = pngSize((await getFieldPropertiesImage())!);
        // Wider than the field, so "fill" scales to the field's height and crops the sides
        expect(size.width / size.height).toBeGreaterThan(fp.width / fp.height);
        const scaledWidth = (size.width * fp.height) / size.height;

        const plan = planField2d(fp, {
            gridLines: true,
            halfLines: true,
            image: size,
        });

        expect(plan.image).not.toBeNull();
        expect(plan.image!.opacity).toBe(0.4);
        expect(plan.image!.y).toBeCloseTo(0, 9);
        expect(plan.image!.height).toBeCloseTo(fp.height, 9);
        expect(plan.image!.width).toBeCloseTo(scaledWidth, 9);
        expect(plan.image!.x).toBeCloseTo((fp.width - scaledWidth) / 2, 9);
    });

    it("puts the image in the SVG and PDF exports", async () => {
        const fp = await getFieldProperties();
        const bytes = await getExportFieldImage();
        expect(bytes && Buffer.from(bytes)).toEqual(Buffer.from(v017Image()));
        const size = pngSize(bytes!);
        const dataUri = `data:image/png;base64,${Buffer.from(bytes!).toString("base64")}`;

        // SVG export: the image element where the 2D field draws it
        const plan = planField2d(fp, {
            gridLines: true,
            halfLines: true,
            image: size,
        }).image!;
        const svg = fieldSvg(fp, {
            gridLines: true,
            halfLines: true,
            image: { href: dataUri, ...size },
        });
        const tag = svg.match(/<image [^>]*\/>/g);
        expect(tag).toHaveLength(1);
        const attr = (name: string) =>
            Number(tag![0].match(new RegExp(` ${name}="([^"]+)"`))![1]);
        expect(attr("opacity")).toBe(0.4);
        expect(attr("x")).toBeCloseTo(plan.x, 1);
        expect(attr("width")).toBeCloseTo(plan.width, 1);
        expect(attr("height")).toBeCloseTo(plan.height, 1);
        expect(tag![0]).toContain(`xlink:href="${dataUri}"`);

        // PDF export: the charts carry a placeholder the main process fills from the file
        const { SVGs } = await generateDrillChartExportSVGs({
            fieldProperties: fp,
            sortedPages: [],
            marchers: [],
            marcherPagesMap: { marcherPagesByPage: {} },
            backgroundImage: { href: dataUri, ...size },
            individualCharts: false,
        });
        expect(SVGs).toEqual([[]]);
        const placeholderSvg = fieldSvg(fp, {
            gridLines: true,
            halfLines: true,
            image: { href: OPENMARCH_FIELD_IMAGE_PLACEHOLDER, ...size },
        });
        const fromMain = await (
            PDFExportService as unknown as {
                getFieldImageDataUri(): Promise<string | null>;
            }
        ).getFieldImageDataUri();
        expect(fromMain).toBe(dataUri);
        expect(
            placeholderSvg.replace(
                OPENMARCH_FIELD_IMAGE_PLACEHOLDER,
                fromMain!,
            ),
        ).toBe(svg);
    });

    it("uses the image for the 3D View's field: under the grid, and as the tarp", async () => {
        const fp = await getFieldProperties();
        const size = pngSize((await getFieldPropertiesImage())!);
        const image = size as unknown as FieldImage;
        const params = {
            homeColor: "#6442ff",
            awayColor: "#c23b3b",
            endZoneText: "OPENMARCH",
            endZoneColor: "#1f2a5c",
        };
        // Where the 2D field draws it, in world meters
        const at = planField2d(fp, {
            gridLines: true,
            halfLines: true,
            image: size,
        }).image!;
        const a = pixelsToWorld(fp, { x: at.x, y: at.y });
        const b = pixelsToWorld(fp, {
            x: at.x + at.width,
            y: at.y + at.height,
        });
        const where = {
            minX: expect.closeTo(a.x, 6),
            maxX: expect.closeTo(b.x, 6),
            minZ: expect.closeTo(a.z, 6),
            maxZ: expect.closeTo(b.z, 6),
        };

        const theme = planField({
            fieldProperties: fp,
            style: "theme",
            params,
            image,
        }).items.filter((i) => i.role === "image");
        expect(theme).toEqual([
            expect.objectContaining({ ...where, opacity: 0.4 }),
        ]);

        // The tarp is the printed image, fully opaque
        const tarp = planField({
            fieldProperties: fp,
            style: "tarp",
            params,
            image,
        }).items;
        expect(tarp.filter((i) => i.role === "image")).toEqual([
            expect.objectContaining({ ...where, opacity: 1 }),
        ]);
        expect(tarp.some((i) => i.role === "tarpArt")).toBe(false);
    });
});
