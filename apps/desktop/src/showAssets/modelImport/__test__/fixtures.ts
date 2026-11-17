// cspell:words basisu dedup draco IHDR
/**
 * Model import fixtures (fork #998): the real files in `fixtures/` (see its README for where each
 * came from and its license), and the cases made from them as the tests run.
 */
import fs from "node:fs";
import path from "node:path";
import {
    Document,
    Logger,
    WebIO,
    type JSONDocument,
} from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3d";
import { encodePng } from "../png";
import type { ImageCodec } from "../imageCodec";
import type { ModelImportEnv } from "../pipeline";
import type { PickedFile } from "../types";

const DIR = path.join(__dirname, "fixtures");

export const read = (name: string) =>
    new Uint8Array(fs.readFileSync(path.join(DIR, name)));

export const picked = (name: string, bytes = read(name)): PickedFile => ({
    name,
    bytes,
});

let decoder: Promise<unknown> | null = null;
/** Draco's Node decoder (the worker loads three's web build instead) */
export const dracoDecoder = () => (decoder ??= draco3d.createDecoderModule());

export const io = async () =>
    new WebIO()
        .setLogger(new Logger(Logger.Verbosity.ERROR))
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ "draco3d.decoder": await dracoDecoder() });

/**
 * Stands in for the browser's codecs in Node: "resizing" makes a gray PNG of the asked size
 * (only PNG, which is all the fixtures shrink), and every texture averages to mid gray.
 */
export const fakeCodec: ImageCodec = {
    async resize(_bytes, mimeType, width, height) {
        if (mimeType !== "image/png")
            throw new Error(`the test codec only writes PNG, not ${mimeType}`);
        return solidPng(width, height, [128, 128, 128, 255]);
    },
    async averageColor() {
        return [0.5, 0.5, 0.5, 1];
    },
};

export const env: ModelImportEnv = {
    images: fakeCodec,
    dracoDecoder,
};

/** A PNG of one color; `rgba[3] < 255` makes one with alpha. */
export function solidPng(
    width: number,
    height: number,
    rgba: [number, number, number, number],
): Promise<Uint8Array> {
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i);
    return encodePng(pixels, width, height);
}

/** A PNG header (signature and IHDR) claiming `width` × `height`, with no pixels after it */
export function pngHeaderOnly(width: number, height: number): Uint8Array {
    const out = new Uint8Array(33);
    out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(out.buffer);
    view.setUint32(8, 13);
    out.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
    view.setUint32(16, width);
    view.setUint32(20, height);
    out.set([8, 6, 0, 0, 0], 24);
    return out;
}

/** An IO that can also write Draco (Node's encoder) */
export const dracoIo = async () =>
    (await io()).registerDependencies({
        "draco3d.encoder": await draco3d.createEncoderModule(),
    });

export async function readGlb(bytes: Uint8Array): Promise<Document> {
    return (await io()).readBinary(bytes);
}

export async function writeGlb(doc: Document): Promise<Uint8Array> {
    return (await io()).writeBinary(doc);
}

/** The chair, changed by `edit`, as a GLB. */
export async function chairWith(
    edit: (doc: Document) => void | Promise<void>,
): Promise<Uint8Array> {
    const doc = await readGlb(read("SheenChair.glb"));
    await edit(doc);
    return writeGlb(doc);
}

/** Wraps the scene's roots in a node with this transform. */
export function wrapRoots(
    doc: Document,
    transform: {
        translation?: [number, number, number];
        rotation?: [number, number, number, number];
        scale?: [number, number, number];
    },
): void {
    const scene = doc.getRoot().listScenes()[0];
    const wrapper = doc.createNode("wrapper");
    if (transform.translation) wrapper.setTranslation(transform.translation);
    if (transform.rotation) wrapper.setRotation(transform.rotation);
    if (transform.scale) wrapper.setScale(transform.scale);
    for (const child of scene.listChildren()) {
        scene.removeChild(child);
        wrapper.addChild(child);
    }
    scene.addChild(wrapper);
}

/** Cesium's box (Draco), decoded and stretched into a post `size` meters, written plain. */
export async function postGlb(
    size: [number, number, number],
    rotation?: [number, number, number, number],
): Promise<Uint8Array> {
    const json = JSON.parse(new TextDecoder().decode(read("Box.gltf")));
    const doc = await (
        await io()
    ).readJSON({
        json,
        resources: { "Box.bin": read("Box.bin") },
    } as JSONDocument);
    for (const ext of doc.getRoot().listExtensionsUsed()) ext.dispose();
    // The box's own node turns it Z-up to Y-up; the post wraps that
    wrapRoots(doc, { scale: size, rotation });
    return writeGlb(doc);
}

/** Edits the raw JSON chunk of a GLB, keeping its BIN chunk. */
export function editGlbJson(
    glb: Uint8Array,
    edit: (json: Record<string, unknown>) => void,
): Uint8Array {
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(
        new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)),
    ) as Record<string, unknown>;
    edit(json);
    const rest = glb.subarray(20 + jsonLength);
    let text = new TextEncoder().encode(JSON.stringify(json));
    const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
    padded.set(text);
    text = padded;
    const out = new Uint8Array(20 + text.length + rest.length);
    const outView = new DataView(out.buffer);
    out.set(glb.subarray(0, 12));
    outView.setUint32(8, out.length, true);
    outView.setUint32(12, text.length, true);
    outView.setUint32(16, 0x4e4f534a, true);
    out.set(text, 20);
    out.set(rest, 20 + text.length);
    return out;
}

/** The texture-coordinate test as a `.gltf` with its `.bin` and `.png` beside it. */
export async function separateGltf(): Promise<PickedFile[]> {
    const doc = await readGlb(read("TextureCoordinateTest.glb"));
    doc.getRoot().listBuffers()[0].setURI("TextureCoordinateTest.bin");
    doc.getRoot()
        .listTextures()
        .forEach((t, i) => t.setURI(`textures/texture${i}.png`));
    const { json, resources } = await (await io()).writeJSON(doc);
    return [
        picked(
            "TextureCoordinateTest.gltf",
            new TextEncoder().encode(JSON.stringify(json)),
        ),
        ...Object.entries(resources).map(([uri, bytes]) =>
            // A file picker gives names only
            picked(uri.slice(uri.lastIndexOf("/") + 1), bytes),
        ),
    ];
}

/** A minimal KTX2 header, `width` × `height` */
export function ktx2Header(width: number, height: number): Uint8Array {
    const out = new Uint8Array(80);
    out.set([
        0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const view = new DataView(out.buffer);
    view.setUint32(20, width, true);
    view.setUint32(24, height, true);
    return out;
}
