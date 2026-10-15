// @vitest-environment node
// cspell:words pycache
/**
 * The Starter kit's contents and zip (package C1.13): license files where
 * ADR 0002 D-21 puts them, one kit version everywhere, the add-on's rules
 * equal to the importer's, and a zip Blender can install the add-on from.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { PLAUSIBLE_SIZE, MODEL_UNIT_CONVERSIONS } from "@/view3d/core/sizes";
import {
    FLAT_RATIO,
    MODEL_KINDS,
    TEXTURE_CAPS,
    TRIANGLE_CAPS,
    TRIANGLE_REJECT_FACTOR,
    Z_UP_FACTOR,
} from "../../model-import/rules";
import {
    ADDON_DIR,
    buildAddonZip,
    buildStarterKitZip,
    KIT_ARTWORK_TEMPLATES,
    readKitVersion,
    starterKitFilename,
} from "../kit";

const KIT = path.resolve(__dirname, "../../../../starter-kit");
const ADDON = path.join(KIT, ADDON_DIR);
const read = (rel: string) => readFile(path.join(KIT, rel), "utf8");

describe("the kit's files", () => {
    it("declares CC0 for the content and GPL-3.0-or-later for the add-on", async () => {
        for (const folder of ["templates", "examples", "presets"]) {
            expect(await read(`${folder}/LICENSE`)).toMatch(
                /^Creative Commons Legal Code\s+CC0 1\.0 Universal/,
            );
        }
        expect(await read(`${ADDON_DIR}/LICENSE`)).toMatch(
            /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/,
        );
        expect(await read(`${ADDON_DIR}/blender_manifest.toml`)).toContain(
            'license = ["SPDX:GPL-3.0-or-later"]',
        );
        for (const file of await readdir(ADDON)) {
            if (!file.endsWith(".py")) continue;
            expect(await read(`${ADDON_DIR}/${file}`)).toMatch(
                /^# SPDX-License-Identifier: GPL-3\.0-or-later\n/,
            );
        }
    });

    it("has a template and an example per kind, and no Garment", async () => {
        const names = ["equipment-flag-pole", "floor-prop-panel", "prop-flat"];
        expect(
            (await readdir(path.join(KIT, "templates"))).filter((f) =>
                f.endsWith(".blend"),
            ),
        ).toEqual(names.map((n) => `${n}.blend`));
        expect(
            (await readdir(path.join(KIT, "examples"))).filter((f) =>
                f.endsWith(".glb"),
            ),
        ).toEqual(names.map((n) => `${n}.glb`));
    });

    it("uses one kit version in the manifest, bl_info and the stamp", async () => {
        const version = await readKitVersion(KIT);
        expect(version).toMatch(/^\d+\.\d+\.\d+$/);
        const init = await read(`${ADDON_DIR}/__init__.py`);
        expect(init).toContain(`"version": (${version.split(".").join(", ")})`);
        expect(await read(`${ADDON_DIR}/core.py`)).toContain(
            `KIT_VERSION = "${version}"`,
        );
        expect(
            await read("presets/operator/export_scene.gltf/OpenMarch.py"),
        ).toContain(`Starter kit ${version}`);
    });

    it("mirrors the importer's numbers in the add-on's rules.json", async () => {
        const rules = JSON.parse(await read(`${ADDON_DIR}/rules.json`));
        expect(rules.kinds).toEqual([...MODEL_KINDS]);
        expect(rules.triangleCaps).toEqual(TRIANGLE_CAPS);
        expect(rules.triangleRejectFactor).toBe(TRIANGLE_REJECT_FACTOR);
        expect(rules.textureCaps).toEqual(TEXTURE_CAPS);
        expect(rules.plausibleSize).toEqual(PLAUSIBLE_SIZE);
        expect(rules.unitConversions).toEqual(
            MODEL_UNIT_CONVERSIONS.map(({ unit, factor }) => ({
                unit,
                factor,
            })),
        );
        expect(rules.zUpFactor).toBe(Z_UP_FACTOR);
        expect(rules.flatRatio).toBe(FLAT_RATIO);
    });

    it("exports with custom properties on, Y-up, modifiers applied and no Draco", async () => {
        const preset = await read(
            "presets/operator/export_scene.gltf/OpenMarch.py",
        );
        for (const line of [
            "op.export_format = 'GLB'",
            "op.export_yup = True",
            "op.export_extras = True",
            "op.export_apply = True",
            "op.export_draco_mesh_compression_enable = False",
        ]) {
            expect(preset).toContain(line);
        }
    });
});

describe("the kit zip", async () => {
    const version = await readKitVersion(KIT);
    const root = `OpenMarch-Blender-Starter-Kit-${version}/`;
    const bytes = await buildStarterKitZip(KIT);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);

    it("is named after the kit version", () => {
        expect(starterKitFilename(version)).toBe(
            `OpenMarch-Blender-Starter-Kit-${version}.zip`,
        );
    });

    it("holds the kit under one versioned folder, without caches", () => {
        expect(names.every((n) => n.startsWith(root))).toBe(true);
        for (const rel of [
            "README.md",
            "templates/LICENSE",
            "templates/prop-flat.blend",
            "examples/LICENSE",
            "examples/equipment-flag-pole.glb",
            "presets/LICENSE",
            "presets/operator/export_scene.gltf/OpenMarch.py",
            "addons/openmarch_tools/__init__.py",
            "addons/openmarch_tools/LICENSE",
            "artwork-templates/LICENSE",
            `openmarch_tools-${version}.zip`,
        ]) {
            expect(names).toContain(root + rel);
        }
        expect(
            names.some((n) =>
                /__pycache__|\.pyc$|\.DS_Store|\.blend\d+$/.test(n),
            ),
        ).toBe(false);
    });

    it("packs the add-on in a folder, as Blender's Install from Disk wants", async () => {
        const inner = await JSZip.loadAsync(await buildAddonZip(KIT));
        const files = Object.keys(inner.files).sort();
        expect(files).toEqual(
            expect.arrayContaining([
                "openmarch_tools/__init__.py",
                "openmarch_tools/blender_manifest.toml",
                "openmarch_tools/core.py",
                "openmarch_tools/LICENSE",
                "openmarch_tools/rules.json",
                "openmarch_tools/ui.py",
            ]),
        );
        expect(files.every((f) => f.startsWith("openmarch_tools/"))).toBe(true);
    });

    it("has every Artwork template but the Uniform panels, as SVG and PDF", () => {
        const templates = names.filter((n) =>
            /artwork-templates\/.+\.(svg|pdf)$/.test(n),
        );
        expect(templates).toHaveLength(KIT_ARTWORK_TEMPLATES.length * 2);
        expect(KIT_ARTWORK_TEMPLATES.some((d) => d.group === "uniform")).toBe(
            false,
        );
        expect(names).toContain(
            `${root}artwork-templates/flat-prop-4x8ft-front.svg`,
        );
    });

    it("is the same bytes every time", async () => {
        expect(
            Buffer.from(await buildStarterKitZip(KIT)).equals(
                Buffer.from(bytes),
            ),
        ).toBe(true);
    });
});
