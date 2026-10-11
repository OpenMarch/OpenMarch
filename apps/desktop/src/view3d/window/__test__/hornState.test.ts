import { describe, expect, it } from "vitest";
import { parseHornState } from "../hornState";
import { useView3dSceneStore } from "../sceneStore";

describe("horn state", () => {
    it("defaults to up and accepts the four states", () => {
        expect(parseHornState(undefined)).toBe("up");
        expect(parseHornState("sideways")).toBe("up");
        expect(parseHornState("trail")).toBe("trail");
    });

    it("starts up in the scene store and changes on request", () => {
        expect(useView3dSceneStore.getState().hornState).toBe("up");
        useView3dSceneStore.getState().setHornState("carry");
        expect(useView3dSceneStore.getState().hornState).toBe("carry");
        useView3dSceneStore.getState().setHornState("up");
    });
});

describe("step-off foot", () => {
    it("starts on the left foot and changes on request", () => {
        expect(useView3dSceneStore.getState().stepOffFoot).toBe("left");
        useView3dSceneStore.getState().setStepOffFoot("right");
        expect(useView3dSceneStore.getState().stepOffFoot).toBe("right");
        useView3dSceneStore.getState().setStepOffFoot("left");
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
