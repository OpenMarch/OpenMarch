// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseHornState } from "../hornState";
import { useView3dSceneStore } from "../sceneStore";

describe("horn state", () => {
    it("defaults to up and accepts the four states", () => {
        expect(parseHornState(undefined)).toBe("up");
        expect(parseHornState("sideways")).toBe("up");
        expect(parseHornState("trail")).toBe("trail");
    });
});

describe("power settings", () => {
    it("start from the saved choices and change on request", () => {
        const s = useView3dSceneStore.getState();
        expect(s.powerPrefs).toEqual({
            pauseWhenIdle: true,
            saveOnBattery: true,
        });
        s.setPowerPrefs({ pauseWhenIdle: false, saveOnBattery: true });
        expect(useView3dSceneStore.getState().powerPrefs.pauseWhenIdle).toBe(
            false,
        );
        s.setPowerPrefs({ pauseWhenIdle: true, saveOnBattery: true });
    });

    it("tracks battery power", () => {
        expect(useView3dSceneStore.getState().onBattery).toBe(false);
        useView3dSceneStore.getState()._setOnBattery(true);
        expect(useView3dSceneStore.getState().onBattery).toBe(true);
        useView3dSceneStore.getState()._setOnBattery(false);
    });
});
