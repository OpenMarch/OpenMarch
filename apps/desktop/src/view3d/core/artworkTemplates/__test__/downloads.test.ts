import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { catalogEntries } from "../../sizes/catalog";
import { toMeters } from "../../sizes/units";
import {
    TEMPLATE_DOWNLOADS,
    TEMPLATE_DOWNLOAD_GROUPS,
    TEMPLATE_SURFACES,
    artworkTemplateFiles,
    templateDownloadSurface,
} from "..";

const ids = TEMPLATE_DOWNLOADS.map((d) => d.surface.id);

describe("TEMPLATE_DOWNLOADS", () => {
    it("has unique ids that the save channel's schema accepts", () => {
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
    });

    it("offers every fixed-size template surface, unchanged", () => {
        for (const surface of TEMPLATE_SURFACES) {
            expect(templateDownloadSurface(surface.id)).toEqual(surface);
        }
    });

    it("lists the groups in menu order, each non-empty", () => {
        const groups = [...new Set(TEMPLATE_DOWNLOADS.map((d) => d.group))];
        expect(groups).toEqual([...TEMPLATE_DOWNLOAD_GROUPS]);
    });

    it("adds the recommended sag to each curve-family Cut only", () => {
        const sagged = TEMPLATE_DOWNLOADS.filter((d) => d.sag);
        expect(sagged.map((d) => d.surface.id)).toEqual([
            "silk-5ft-30x46-sag-7.5in",
            "silk-5.5ft-33x50-sag-8.25in",
            "silk-6ft-36x54-sag-9in",
            "silk-7ft-42x60-sag-10.5in",
            "silk-standard-36x56-sag-9in",
            "silk-oversized-42x67-sag-10.5in",
        ]);
        const six = templateDownloadSurface("silk-6ft-36x54-sag-9in")!;
        expect(six.cut).toBe("curve");
        expect(six.height.m).toBeCloseTo(toMeters(45, "in"), 12);
    });

    it("offers the swing's sagging bottom", () => {
        const swing = TEMPLATE_DOWNLOADS.find(
            (d) => d.variant === "sagging-bottom",
        )!;
        expect(swing.surface.id).toBe("silk-swing-44x66-sagging-bottom");
        expect(swing.surface.height.m).toBeGreaterThan(toMeters(57, "in"));
    });

    it("sizes a Floor prop and a prop top from the default sheet", () => {
        const floorProp = templateDownloadSurface("floor-prop-4x8ft")!;
        expect(floorProp.kind).toBe("floorProp");
        expect(floorProp.width.m).toBe(toMeters(4, "ft"));
        expect(floorProp.height.m).toBe(toMeters(8, "ft"));
        const top = templateDownloadSurface("prop-top-4x8ft")!;
        expect(top.kind).toBe("propTop");
        expect(top.orientation).toBe("frontBottom");
        const props = TEMPLATE_DOWNLOADS.filter((d) => d.group === "prop");
        expect(props.map((d) => d.face)).toEqual(["top", "front", "back"]);
    });

    it("names every silk Cut, floor and uniform panel once in its group", () => {
        const count = (group: string) =>
            TEMPLATE_DOWNLOADS.filter(
                (d) => d.group === group && !d.sag && !d.variant,
            ).length;
        expect(count("silk")).toBe(catalogEntries("silk").length);
        expect(count("floor")).toBe(catalogEntries("floor").length);
        expect(count("uniform")).toBe(5);
    });

    it("makes all three formats for every download", () => {
        for (const { surface } of TEMPLATE_DOWNLOADS) {
            const files = artworkTemplateFiles(surface, {
                deflate: (d) => deflateSync(d),
            });
            expect(files.map((f) => f.name).sort()).toEqual(
                ["pdf", "png", "svg"].map((ext) => `${surface.id}.${ext}`),
            );
        }
    });

    it("refuses an id the menu doesn't offer", () => {
        expect(templateDownloadSurface("silk-6ft-36x54-sag-1in")).toBe(
            undefined,
        );
    });
});
