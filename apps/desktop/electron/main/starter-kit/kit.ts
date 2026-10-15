// cspell:words pycache
/**
 * The Blender Starter kit zip (package C1.13; props-spec.md section 2
 * "Starter kit"; ADR 0002 D-13 and D-21). Help ‣ Get the Blender starter kit…
 * saves it.
 *
 * The kit's files live in `apps/desktop/starter-kit/` and ship in the app
 * (electron-builder `files`). The zip holds that folder as is, plus:
 *
 * - `openmarch_tools-<version>.zip`, the add-on packed so Blender's "Install
 *   from Disk" takes it, as an extension (4.2 and later) or a legacy add-on;
 * - `artwork-templates/`, the C1.12 Artwork templates as SVG and PDF, made
 *   here by the same code as the app's template downloads. Uniform panel
 *   templates are left out: they're sized from the om-pose median body,
 *   which waits on the legal gate (C1.2).
 *
 * Plain Node: no Electron, so tests build the zip directly.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import {
    DEFAULT_TEMPLATE_POLICY,
    layoutTemplate,
    resolveTemplate,
    TEMPLATE_DOWNLOADS,
    templatePdf,
    templateSvg,
} from "../../../src/view3d/core/artworkTemplates";

/** The kit's folder name in the app (and in `apps/desktop`). */
export const STARTER_KIT_DIRNAME = "starter-kit";

/** The add-on's folder inside the kit. */
export const ADDON_DIR = path.join("addons", "openmarch_tools");

/** Template downloads that go in the kit: all but the om-pose-derived ones. */
export const KIT_ARTWORK_TEMPLATES = TEMPLATE_DOWNLOADS.filter(
    (d) => d.group !== "uniform",
);

/** Caches and Blender's `.blend1` backups never go in the zip. */
const SKIPPED = /(^|\/)(\.DS_Store|__pycache__|.*\.pyc|.*\.blend\d+)$/;

const CC0_NOTE = `The Artwork templates in this folder are dedicated to the public domain
under CC0 1.0 Universal; see ../templates/LICENSE for the full text. They
are the same files as OpenMarch's Artwork templates menu.
`;

/** The kit version, from the add-on's `blender_manifest.toml`. */
export async function readKitVersion(kitDir: string): Promise<string> {
    const manifest = await readFile(
        path.join(kitDir, ADDON_DIR, "blender_manifest.toml"),
        "utf8",
    );
    const match = /^version\s*=\s*"([^"]+)"/m.exec(manifest);
    if (!match) throw new Error("blender_manifest.toml has no version");
    return match[1];
}

/** The file name the save dialog suggests. */
export function starterKitFilename(version: string): string {
    return `OpenMarch-Blender-Starter-Kit-${version}.zip`;
}

/** Every file under `dir`, as POSIX paths relative to it, sorted. */
async function listFiles(dir: string, prefix = ""): Promise<string[]> {
    const entries = await readdir(path.join(dir, prefix), {
        withFileTypes: true,
    });
    const files: string[] = [];
    for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (SKIPPED.test(rel)) continue;
        if (entry.isDirectory()) files.push(...(await listFiles(dir, rel)));
        else if (entry.isFile()) files.push(rel);
    }
    return files.sort();
}

// A fixed date, so the same kit gives the same zip.
const ZIP_DATE = new Date(Date.UTC(2026, 0, 1));

function addFile(zip: JSZip, name: string, data: string | Uint8Array) {
    zip.file(name, data, { date: ZIP_DATE, createFolders: false });
}

async function generate(zip: JSZip): Promise<Uint8Array> {
    return zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
        platform: "UNIX",
    });
}

/** The add-on as Blender's "Install from Disk" takes it. */
export async function buildAddonZip(kitDir: string): Promise<Uint8Array> {
    const zip = new JSZip();
    const addonDir = path.join(kitDir, ADDON_DIR);
    for (const rel of await listFiles(addonDir)) {
        addFile(
            zip,
            `openmarch_tools/${rel}`,
            await readFile(path.join(addonDir, rel)),
        );
    }
    return generate(zip);
}

/** The whole kit as one zip, under a versioned top folder. */
export async function buildStarterKitZip(kitDir: string): Promise<Uint8Array> {
    const version = await readKitVersion(kitDir);
    const root = `OpenMarch-Blender-Starter-Kit-${version}`;
    const zip = new JSZip();
    for (const rel of await listFiles(kitDir)) {
        addFile(zip, `${root}/${rel}`, await readFile(path.join(kitDir, rel)));
    }
    addFile(
        zip,
        `${root}/openmarch_tools-${version}.zip`,
        await buildAddonZip(kitDir),
    );
    for (const { surface } of KIT_ARTWORK_TEMPLATES) {
        const drawing = layoutTemplate(
            resolveTemplate(surface, DEFAULT_TEMPLATE_POLICY),
        );
        const base = `${root}/artwork-templates/${surface.id}`;
        addFile(zip, `${base}.svg`, templateSvg(drawing));
        addFile(zip, `${base}.pdf`, templatePdf(drawing));
    }
    addFile(zip, `${root}/artwork-templates/LICENSE`, CC0_NOTE);
    return generate(zip);
}
