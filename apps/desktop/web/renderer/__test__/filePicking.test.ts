// cspell:words KHTML
import { describe, expect, it } from "vitest";
import {
    hasExtension,
    isAppleTouchDevice,
    looksLikeSqlite,
    pickerAccept,
    shareFile,
    showFileProblem,
} from "../filePicking";

const IPAD_OS =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const OLD_IPAD =
    "Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_TABLET =
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const WINDOWS =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

describe("isAppleTouchDevice", () => {
    it("counts an iPad that says it is a Mac, by its touch screen", () => {
        expect(
            isAppleTouchDevice({ userAgent: IPAD_OS, maxTouchPoints: 5 }),
        ).toBe(true);
    });
    it("does not count a Mac", () => {
        expect(
            isAppleTouchDevice({ userAgent: IPAD_OS, maxTouchPoints: 0 }),
        ).toBe(false);
        expect(isAppleTouchDevice({ userAgent: IPAD_OS })).toBe(false);
    });
    it("counts an iPad that says so", () => {
        expect(isAppleTouchDevice({ userAgent: OLD_IPAD })).toBe(true);
    });
    it("does not count Android or Windows tablets", () => {
        expect(
            isAppleTouchDevice({
                userAgent: ANDROID_TABLET,
                maxTouchPoints: 10,
            }),
        ).toBe(false);
        expect(
            isAppleTouchDevice({ userAgent: WINDOWS, maxTouchPoints: 10 }),
        ).toBe(false);
    });
});

describe("pickerAccept", () => {
    it("leaves other devices alone", () => {
        expect(pickerAccept(".dots", false)).toBe(".dots");
        expect(pickerAccept("audio/*,.mp3", false)).toBe("audio/*,.mp3");
    });
    it("accepts any file on iOS when only extensions are named", () => {
        expect(pickerAccept(".dots", true)).toBe("");
    });
    it("keeps only MIME types on iOS", () => {
        expect(
            pickerAccept("audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.flac", true),
        ).toBe("audio/*");
        expect(pickerAccept(" .csv , text/csv", true)).toBe("text/csv");
    });
});

const sqliteBytes = () => {
    const bytes = new Uint8Array(32);
    bytes.set(new TextEncoder().encode("SQLite format 3\u0000"));
    return bytes;
};

describe("show file checks", () => {
    it("matches extensions without case", () => {
        expect(hasExtension("Show.DOTS", ".dots")).toBe(true);
        expect(hasExtension("show.dots.zip", ".dots")).toBe(false);
    });
    it("recognizes a SQLite header", () => {
        expect(looksLikeSqlite(sqliteBytes())).toBe(true);
        expect(
            looksLikeSqlite(new TextEncoder().encode("PK\u0003\u0004")),
        ).toBe(false);
        expect(looksLikeSqlite(new Uint8Array(4))).toBe(false);
    });
    it("accepts a .dots SQLite file and explains anything else", () => {
        expect(showFileProblem("Halftime.dots", sqliteBytes())).toBeNull();
        expect(showFileProblem("IMG_0001.jpg", sqliteBytes())).toMatch(
            /IMG_0001\.jpg.*\.dots/,
        );
        expect(showFileProblem("fake.dots", new Uint8Array(32))).not.toBeNull();
    });
});

describe("shareFile", () => {
    const file = new File([new Uint8Array(1)], "show.dots");
    const nav = (share: () => Promise<void>, canShare = true) =>
        ({ share, canShare: () => canShare }) as unknown as Navigator;

    it("is unavailable without the Web Share API or file support", async () => {
        expect(await shareFile(file, {} as Navigator)).toBe("unavailable");
        expect(
            await shareFile(
                file,
                nav(async () => {}, false),
            ),
        ).toBe("unavailable");
    });
    it("reports a share, a closed sheet, and a refusal", async () => {
        expect(
            await shareFile(
                file,
                nav(async () => {}),
            ),
        ).toBe("shared");
        const fail = (name: string) => async () => {
            throw Object.assign(new Error(name), { name });
        };
        expect(await shareFile(file, nav(fail("AbortError")))).toBe(
            "cancelled",
        );
        expect(await shareFile(file, nav(fail("NotAllowedError")))).toBe(
            "unavailable",
        );
    });
});
