// cspell:words Fsecret fetc Csecret
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ net: {}, protocol: {} }));
const { appFilePath, byteRange } = await import("../appProtocol");

const ROOT = path.resolve("/opt/OpenMarch/resources/app.asar/dist");

describe("appFilePath", () => {
    it.each([
        ["app://openmarch/", "index.html"],
        ["app://openmarch/index.html", "index.html"],
        ["app://openmarch/index.html?show=x#settings", "index.html"],
        [
            "app://openmarch/assets/modelImport.worker-Cs5k_fz5.js",
            "assets/modelImport.worker-Cs5k_fz5.js",
        ],
        ["app://openmarch/assets/a%20b.glb", "assets/a b.glb"],
        // The URL parser drops dot segments before the handler sees them
        ["app://openmarch/assets/../index.html", "index.html"],
        ["app://openmarch/%2e%2e/%2e%2e/etc/passwd", "etc/passwd"],
    ])("%s is %s", (url, file) => {
        expect(appFilePath(url, ROOT)).toBe(path.join(ROOT, file));
    });

    it.each([
        "app://openmarch/..%2F..%2Fsecret",
        "app://openmarch/assets/..%2f..%2f..%2fetc/passwd",
        "app://openmarch/..%5C..%5Csecret",
        "app://openmarch/a%00b",
        "app://openmarch/%E0%A4%A",
        "app://other/index.html",
        "file:///opt/OpenMarch/resources/app.asar/dist/index.html",
        "not a url",
    ])("refuses %s", (url) => {
        expect(appFilePath(url, ROOT)).toBeNull();
    });
});

describe("byteRange", () => {
    it.each([
        ["bytes=0-99", { start: 0, end: 99 }],
        ["bytes=100-", { start: 100, end: 999 }],
        ["bytes=-100", { start: 900, end: 999 }],
        ["bytes=900-5000", { start: 900, end: 999 }],
        ["bytes=-5000", { start: 0, end: 999 }],
    ])("%s of 1000 bytes", (header, range) => {
        expect(byteRange(header, 1000)).toEqual(range);
    });

    it.each(["bytes=1000-", "bytes=50-10"])(
        "%s can't be met in 1000 bytes",
        (header) => {
            expect(byteRange(header, 1000)).toBe("unsatisfiable");
        },
    );

    it.each([null, "", "bytes=-", "bytes=0-1,5-9", "items=0-1"])(
        "%s sends the whole file",
        (header) => {
            expect(byteRange(header, 1000)).toBeNull();
        },
    );
});
