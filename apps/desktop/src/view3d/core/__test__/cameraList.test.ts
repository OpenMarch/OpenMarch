// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CameraSeat } from "../types";
import {
    cameraListSchema,
    defaultCameraList,
    EMPTY_SHOW_CAMERAS,
    parseShowCamerasJson,
    showCamerasSchema,
    withVenueCameras,
    editCameraList,
    MAX_CAMERAS,
    newCameraId,
    newCameraName,
    resolveCameras,
    type SavedCamera,
    type ViewPose,
} from "../cameraList";

const seat = (id: string): CameraSeat => ({
    id,
    labelKey: `view3d.camera.${id}`,
    kind: "seat",
    position: [0, 10, 20],
    target: [0, 0, -20],
});
const kitCameras = [seat("pressBox"), seat("frontRow"), seat("topDown")];
const pose: ViewPose = {
    position: [1.23456, 2, 3],
    target: [4, 5, 6.0004],
    fovDeg: 50,
};

describe("resolveCameras", () => {
    it("lists the kit's defaults when the show has no list", () => {
        expect(resolveCameras(kitCameras, undefined)).toEqual(kitCameras);
    });

    it("follows the show's order, names and saved views, and skips missing kit cameras", () => {
        const saved: SavedCamera[] = [
            {
                kind: "view",
                id: "view1",
                name: "Drum major",
                position: [1, 2, 3],
                target: [4, 5, 6],
                fovDeg: 40,
            },
            { kind: "kit", id: "topDown", name: "Overhead" },
            { kind: "kit", id: "gone" },
            { kind: "kit", id: "pressBox" },
        ];
        const cameras = resolveCameras(kitCameras, saved);
        expect(cameras.map((c) => c.id)).toEqual([
            "view1",
            "topDown",
            "pressBox",
        ]);
        expect(cameras[0]).toMatchObject({
            kind: "saved",
            name: "Drum major",
            position: [1, 2, 3],
            fovDeg: 40,
        });
        expect(cameras[1]).toMatchObject({
            name: "Overhead",
            labelKey: "view3d.camera.topDown",
        });
        expect(cameras[2].name).toBeUndefined();
    });

    it("lists nothing for an empty list", () => {
        expect(resolveCameras(kitCameras, [])).toEqual([]);
    });
});

describe("editCameraList", () => {
    const list = defaultCameraList(kitCameras);

    it("adds a saved view at the end, rounded to millimeters", () => {
        const next = editCameraList(list, {
            kind: "add",
            id: "view1",
            name: " Camera 1 ",
            pose,
        });
        expect(next).toHaveLength(4);
        expect(next[3]).toEqual({
            kind: "view",
            id: "view1",
            name: "Camera 1",
            position: [1.235, 2, 3],
            target: [4, 5, 6],
            fovDeg: 50,
        });
    });

    it("doesn't add past the limit", () => {
        let full: SavedCamera[] = [];
        for (let i = 0; i < MAX_CAMERAS; i++)
            full = editCameraList(full, {
                kind: "add",
                id: newCameraId(full),
                name: "x",
                pose,
            });
        expect(full).toHaveLength(MAX_CAMERAS);
        expect(
            editCameraList(full, { kind: "add", id: "extra", name: "x", pose }),
        ).toHaveLength(MAX_CAMERAS);
    });

    it("renames, and an empty name gives a default camera its label back", () => {
        const named = editCameraList(list, {
            kind: "rename",
            id: "frontRow",
            name: "Judges",
        });
        expect(named[1]).toEqual({
            kind: "kit",
            id: "frontRow",
            name: "Judges",
        });
        expect(
            editCameraList(named, {
                kind: "rename",
                id: "frontRow",
                name: " ",
            })[1],
        ).toEqual({ kind: "kit", id: "frontRow" });
    });

    it("keeps a saved view's name when renamed to nothing", () => {
        const added = editCameraList([], {
            kind: "add",
            id: "view1",
            name: "Mine",
            pose,
        });
        expect(
            editCameraList(added, { kind: "rename", id: "view1", name: "" })[0],
        ).toMatchObject({ name: "Mine" });
    });

    it("turns a default camera into a saved view with its label on setView", () => {
        const next = editCameraList(
            list,
            { kind: "setView", id: "pressBox", pose },
            () => "Press box",
        );
        expect(next[0]).toMatchObject({
            kind: "view",
            id: "pressBox",
            name: "Press box",
            fovDeg: 50,
        });
        expect(next.slice(1)).toEqual(list.slice(1));
    });

    it("moves within bounds and removes", () => {
        expect(
            editCameraList(list, { kind: "move", id: "topDown", by: -1 }).map(
                (c) => c.id,
            ),
        ).toEqual(["pressBox", "topDown", "frontRow"]);
        expect(
            editCameraList(list, { kind: "move", id: "pressBox", by: -1 }),
        ).toEqual(list);
        expect(
            editCameraList(list, { kind: "remove", id: "frontRow" }).map(
                (c) => c.id,
            ),
        ).toEqual(["pressBox", "topDown"]);
    });
});

describe("new camera ids and names", () => {
    it("picks the first free number", () => {
        expect(
            newCameraId([
                { kind: "kit", id: "view1" },
                { kind: "kit", id: "view3" },
            ]),
        ).toBe("view2");
        expect(
            newCameraName(["Camera 1", "Press box"], (n) => `Camera ${n}`),
        ).toBe("Camera 2");
    });
});

describe("the show's cameras", () => {
    it("rejects duplicate ids", () => {
        expect(
            cameraListSchema.safeParse([
                { kind: "kit", id: "pressBox" },
                { kind: "kit", id: "pressBox" },
            ]).success,
        ).toBe(false);
    });

    it("keeps a list per venue, and goes back to defaults by removing it", () => {
        const list: SavedCamera[] = [{ kind: "kit", id: "pressBox" }];
        const hs = withVenueCameras(EMPTY_SHOW_CAMERAS, "hs", { list });
        const both = withVenueCameras(hs, "gym", { list: [] });
        expect(Object.keys(both.venues)).toEqual(["hs", "gym"]);
        expect(showCamerasSchema.parse(both)).toEqual(both);
        expect(
            withVenueCameras(
                withVenueCameras(both, "gym", undefined),
                "hs",
                undefined,
            ),
        ).toEqual(EMPTY_SHOW_CAMERAS);
    });

    it("reads stored JSON, and ignores what doesn't match", () => {
        const hs = withVenueCameras(EMPTY_SHOW_CAMERAS, "hs", { list: [] });
        expect(parseShowCamerasJson(JSON.stringify(hs))).toEqual(hs);
        expect(parseShowCamerasJson("not json")).toBeUndefined();
        expect(
            parseShowCamerasJson(
                JSON.stringify({
                    version: 1,
                    venues: { hs: { list: [{ kind: "view", id: "v" }] } },
                }),
            ),
        ).toBeUndefined();
    });

    it("drops the camera profile a fork build stored with a list", () => {
        const list: SavedCamera[] = [{ kind: "kit", id: "pressBox" }];
        const profile = {
            id: "p1",
            name: "Home stadium",
            updatedAt: "2026-10-16T00:00:00.000Z",
            cameras: list,
        };
        expect(
            parseShowCamerasJson(
                JSON.stringify({
                    version: 1,
                    venues: { hs: { list, profile } },
                }),
            ),
        ).toEqual({ version: 1, venues: { hs: { list } } });
    });
});
