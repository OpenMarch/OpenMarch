import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import type { CinemaContext, CinemaShot } from "@openmarch/core";
import { useCameraStore } from "../../camera/cameraStore";
import { RigController } from "../../camera/rigController";
import { demoTrack } from "../demoTrack";
import {
    DIRECTOR_STORAGE_KEY,
    directedPose,
    directorAvailable,
    toggleDirector,
    useDirectorStore,
} from "../directorStore";

const ctx: CinemaContext = {
    footprint: { minX: -54.86, maxX: 54.86, minZ: -48.77, maxZ: 0 },
    stepMeters: 0.5715,
    aspect: 16 / 9,
    subjectPoints: () => [
        { x: -10, z: -15 },
        { x: 10, z: -25 },
    ],
};
const track = (): CinemaShot[] => demoTrack(64, (count) => count * 500);

beforeEach(() => {
    useDirectorStore.setState({ directing: false, track: [] });
    useCameraStore.setState({
        activeCameraId: null,
        pickMode: false,
        _request: null,
    });
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("directorAvailable", () => {
    it("is on in a dev build", () => {
        vi.stubEnv("DEV", true);
        expect(directorAvailable()).toBe(true);
    });

    it("is off in a release build without the flag", () => {
        vi.stubEnv("DEV", false);
        expect(directorAvailable()).toBe(false);
    });

    it("is on in a release build with the flag set", () => {
        vi.stubEnv("DEV", false);
        localStorage.setItem(DIRECTOR_STORAGE_KEY, "1");
        expect(DIRECTOR_STORAGE_KEY).toBe("view3d.director");
        expect(directorAvailable()).toBe(true);
        localStorage.setItem(DIRECTOR_STORAGE_KEY, "0");
        expect(directorAvailable()).toBe(false);
    });

    it("is off when storage can't be read", () => {
        vi.stubEnv("DEV", false);
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        expect(directorAvailable()).toBe(false);
    });
});

describe("the director store", () => {
    it("turns on and off, and keeps its track", () => {
        const shots = track();
        useDirectorStore.getState().setTrack(shots);
        useDirectorStore.getState().setDirecting(true);
        expect(useDirectorStore.getState().directing).toBe(true);
        useDirectorStore.getState().setDirecting(false);
        expect(useDirectorStore.getState().directing).toBe(false);
        expect(useDirectorStore.getState().track).toBe(shots);
    });

    it("leaves no camera selected, and ends pick-a-seat, when it turns on", () => {
        useCameraStore.setState({ activeCameraId: "pressBox", pickMode: true });
        useDirectorStore.getState().setDirecting(true);
        expect(useCameraStore.getState().activeCameraId).toBeNull();
        expect(useCameraStore.getState().pickMode).toBe(false);
        expect(useDirectorStore.getState().directing).toBe(true);
    });

    it("turns off when the viewer chooses a camera", () => {
        useDirectorStore.getState().setDirecting(true);
        useCameraStore.getState().selectCamera("pressBox");
        expect(useDirectorStore.getState().directing).toBe(false);
        expect(useCameraStore.getState().activeCameraId).toBe("pressBox");
    });

    it("turns off when the view is saved as a camera", () => {
        useDirectorStore.getState().setDirecting(true);
        useCameraStore.getState().markActive("saved");
        expect(useDirectorStore.getState().directing).toBe(false);
    });

    it("toggles only where the director is available", () => {
        vi.stubEnv("DEV", false);
        toggleDirector();
        expect(useDirectorStore.getState().directing).toBe(false);
        vi.stubEnv("DEV", true);
        toggleDirector();
        expect(useDirectorStore.getState().directing).toBe(true);
        toggleDirector();
        expect(useDirectorStore.getState().directing).toBe(false);
    });
});

describe("directedPose", () => {
    it("is null while the director is off or has no track", () => {
        expect(directedPose(0, ctx)).toBeNull();
        useDirectorStore.getState().setDirecting(true);
        expect(directedPose(0, ctx)).toBeNull();
        useDirectorStore.getState().setTrack(track());
        useDirectorStore.getState().setDirecting(false);
        expect(directedPose(0, ctx)).toBeNull();
    });

    it("is the track's camera at the show time, whatever was asked before", () => {
        useDirectorStore.getState().setTrack(track());
        useDirectorStore.getState().setDirecting(true);
        const forward = [0, 4000, 9000, 20000].map((ms) =>
            directedPose(ms, ctx),
        );
        const backward = [20000, 9000, 4000, 0]
            .map((ms) => directedPose(ms, ctx))
            .reverse();
        expect(backward).toEqual(forward);
        expect(forward[0]).not.toEqual(forward[3]);
    });
});

describe("the viewer takes the camera back from the director", () => {
    it("leaves the camera where the director had it", () => {
        const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 5000);
        const rig = new RigController(camera);
        useDirectorStore.getState().setTrack(track());
        useDirectorStore.getState().setDirecting(true);
        const pose = directedPose(9000, ctx)!;
        rig.jumpTo(pose.position, pose.target, pose.fovDeg);
        const at = camera.position.toArray();

        // what any drag, scroll or key does first
        useDirectorStore.getState().setDirecting(false);
        expect(directedPose(9000, ctx)).toBeNull();
        rig.update(16);
        rig.update(32);
        camera.position.toArray().forEach((v, i) => {
            expect(v).toBeCloseTo(at[i], 6);
        });
        expect(camera.fov).toBeCloseTo(pose.fovDeg, 6);

        // and the viewer's own move starts from there
        expect(rig.orbit(4, 0)).toBe(true);
        rig.update(48);
        const moved = camera.position.distanceTo(
            new PerspectiveCamera().position.fromArray(at),
        );
        expect(moved).toBeGreaterThan(0);
        expect(moved).toBeLessThan(
            0.05 *
                Math.hypot(...pose.position.map((v, i) => v - pose.target[i])),
        );
    });
});
