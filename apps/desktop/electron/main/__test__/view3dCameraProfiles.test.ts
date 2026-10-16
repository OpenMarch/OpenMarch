import { describe, expect, it } from "vitest";
import { createCameraProfileHandlers } from "../view3dCameraProfiles";
import type { LibraryStore } from "../library/store";
import type { CameraProfileEntry } from "../library/types";

const ID = "11111111-2222-4333-8444-555555555555";
const at = "2026-10-16T12:00:00.000Z";
const data = { kit: "hs", cameras: [{ kind: "kit", id: "pressBox" }] };

function fakeStore(entries: CameraProfileEntry[]) {
    const saved: unknown[] = [];
    const removed: string[] = [];
    const store = {
        listCameraProfiles: async () => entries,
        saveCameraProfile: async (input: {
            id?: string;
            name: string;
            data: unknown;
        }) => {
            saved.push(input);
            return {
                id: input.id ?? ID,
                name: input.name,
                createdAt: at,
                updatedAt: at,
                data: input.data,
            } as CameraProfileEntry;
        },
        deleteCameraProfile: async (id: string) => {
            removed.push(id);
        },
    } as unknown as LibraryStore;
    return { store, saved, removed };
}

describe("3D View camera profile handlers", () => {
    it("lists valid profiles flat and skips entries in another shape", async () => {
        const { store } = fakeStore([
            { id: ID, name: "Judges", createdAt: at, updatedAt: at, data },
            {
                id: "22222222-2222-4333-8444-555555555555",
                name: "Future",
                createdAt: at,
                updatedAt: at,
                data: { kit: "moon", cameras: [] },
            },
        ]);
        const handlers = createCameraProfileHandlers(async () => store);
        expect(await handlers.list()).toEqual([
            {
                id: ID,
                name: "Judges",
                createdAt: at,
                updatedAt: at,
                kit: "hs",
                cameras: data.cameras,
            },
        ]);
    });

    it("checks what the window sends", async () => {
        const { store, saved, removed } = fakeStore([]);
        const handlers = createCameraProfileHandlers(async () => store);
        await expect(handlers.save({ name: "", data })).rejects.toThrow();
        await expect(
            handlers.save({ name: "x", data: { kit: "hs", cameras: "no" } }),
        ).rejects.toThrow();
        await expect(
            handlers.save({ id: "../../etc", name: "x", data }),
        ).rejects.toThrow();
        await expect(handlers.remove(42)).rejects.toThrow();
        expect(saved).toEqual([]);
        expect(removed).toEqual([]);

        const profile = await handlers.save({ name: " Judges ", data });
        expect(profile).toMatchObject({ id: ID, name: "Judges", kit: "hs" });
        await handlers.remove(ID);
        expect(removed).toEqual([ID]);
    });
});
