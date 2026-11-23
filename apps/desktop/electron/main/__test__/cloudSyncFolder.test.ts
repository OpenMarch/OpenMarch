/** Recognizing a show in a cloud-synced folder (`cloudSyncFolder.ts`). */
import { describe, expect, it } from "vitest";
import {
    cloudSyncServiceFor,
    type CloudSyncEnvironment,
} from "../cloudSyncFolder";

function windows(
    env: NodeJS.ProcessEnv = {},
    home = "C:\\Users\\Sam",
): CloudSyncEnvironment {
    return {
        platform: "win32",
        home,
        env,
        exists: () => false,
        realpath: (p) => p,
    };
}

function mac(existing: string[] = []): CloudSyncEnvironment {
    return {
        platform: "darwin",
        home: "/Users/sam",
        env: {},
        exists: (p) => existing.includes(p),
        realpath: (p) => p,
    };
}

const linux: CloudSyncEnvironment = {
    platform: "linux",
    home: "/home/sam",
    env: {},
    exists: () => false,
    realpath: (p) => p,
};

describe("cloudSyncServiceFor", () => {
    describe("Windows", () => {
        it("finds OneDrive by its folder variables, whatever the folder is called", () => {
            const env = { OneDrive: "C:\\Users\\Sam\\Cloud" };
            expect(
                cloudSyncServiceFor(
                    "C:\\Users\\Sam\\Cloud\\Documents\\Show.dots",
                    windows(env),
                ),
            ).toBe("OneDrive");
            expect(
                cloudSyncServiceFor(
                    "c:\\users\\sam\\cloud\\Show.dots",
                    windows(env),
                ),
            ).toBe("OneDrive");
        });

        it("finds OneDrive folders by name, work accounts included", () => {
            expect(
                cloudSyncServiceFor(
                    "C:\\Users\\Sam\\OneDrive\\Documents\\Show.dots",
                    windows(),
                ),
            ).toBe("OneDrive");
            expect(
                cloudSyncServiceFor(
                    "C:\\Users\\Sam\\OneDrive - Lincoln High\\Band\\Show.dots",
                    windows(),
                ),
            ).toBe("OneDrive");
        });

        it("doesn't take a folder next to OneDrive's for it", () => {
            const env = { OneDrive: "C:\\Users\\Sam\\OneDrive" };
            expect(
                cloudSyncServiceFor(
                    "C:\\Users\\Sam\\OneDriveOld\\Show.dots",
                    windows(env),
                ),
            ).toBe(null);
        });

        it("finds Google Drive, Dropbox, iCloud Drive and Box", () => {
            expect(
                cloudSyncServiceFor("G:\\My Drive\\Band\\Show.dots", windows()),
            ).toBe("Google Drive");
            expect(
                cloudSyncServiceFor(
                    "C:\\Users\\Sam\\Dropbox (Lincoln)\\Show.dots",
                    windows(),
                ),
            ).toBe("Dropbox");
            expect(
                cloudSyncServiceFor(
                    "C:\\Users\\Sam\\iCloudDrive\\Show.dots",
                    windows(),
                ),
            ).toBe("iCloud Drive");
            expect(
                cloudSyncServiceFor(
                    "C:\\Users\\Sam\\Box\\Show.dots",
                    windows(),
                ),
            ).toBe("Box");
        });

        it("leaves local folders alone", () => {
            const env = { OneDrive: "C:\\Users\\Sam\\OneDrive" };
            for (const file of [
                "C:\\Users\\Sam\\Documents\\Show.dots",
                "C:\\OpenMarch\\Show.dots",
                "C:\\Users\\Sam\\Documents\\Box drill\\Show.dots",
                "D:\\Shows\\My Drive notes\\Show.dots",
            ])
                expect(cloudSyncServiceFor(file, windows(env))).toBe(null);
        });
    });

    describe("macOS", () => {
        it("finds iCloud Drive and the CloudStorage providers", () => {
            expect(
                cloudSyncServiceFor(
                    "/Users/sam/Library/Mobile Documents/com~apple~CloudDocs/Show.dots",
                    mac(),
                ),
            ).toBe("iCloud Drive");
            expect(
                cloudSyncServiceFor(
                    "/Users/sam/Library/CloudStorage/OneDrive-Personal/Show.dots",
                    mac(),
                ),
            ).toBe("OneDrive");
            expect(
                cloudSyncServiceFor(
                    "/Users/sam/Library/CloudStorage/GoogleDrive-sam@example.com/My Drive/Show.dots",
                    mac(),
                ),
            ).toBe("Google Drive");
            expect(
                cloudSyncServiceFor(
                    "/Users/sam/Library/CloudStorage/Dropbox/Show.dots",
                    mac(),
                ),
            ).toBe("Dropbox");
        });

        it("finds Documents and Desktop only when iCloud keeps them", () => {
            const file = "/Users/sam/Documents/Band/Show.dots";
            expect(cloudSyncServiceFor(file, mac())).toBe(null);
            expect(
                cloudSyncServiceFor(
                    file,
                    mac([
                        "/Users/sam/Library/Mobile Documents/com~apple~CloudDocs/Documents",
                    ]),
                ),
            ).toBe("iCloud Drive");
            // Desktop isn't kept just because Documents is.
            expect(
                cloudSyncServiceFor(
                    "/Users/sam/Desktop/Show.dots",
                    mac([
                        "/Users/sam/Library/Mobile Documents/com~apple~CloudDocs/Documents",
                    ]),
                ),
            ).toBe(null);
        });

        it("follows links to where the file really is", () => {
            const environment = {
                ...mac(),
                realpath: () =>
                    "/Users/sam/Library/CloudStorage/Box-Box/Show.dots",
            };
            expect(
                cloudSyncServiceFor("/Users/sam/Shows/Show.dots", environment),
            ).toBe("Box");
        });
    });

    it("finds Dropbox on Linux, and nothing else there", () => {
        expect(cloudSyncServiceFor("/home/sam/Dropbox/Show.dots", linux)).toBe(
            "Dropbox",
        );
        expect(
            cloudSyncServiceFor("/home/sam/Documents/Show.dots", linux),
        ).toBe(null);
    });

    it("is null with no file", () => {
        expect(cloudSyncServiceFor("", linux)).toBe(null);
    });
});
