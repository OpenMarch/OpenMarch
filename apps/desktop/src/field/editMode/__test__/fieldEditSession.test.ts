import { describe, expect, it, vi } from "vitest";
import {
    beginFieldEditSession,
    discardFieldEditSession,
    trackFieldEdit,
} from "../fieldEditSession";

const { order } = vi.hoisted(() => ({ order: [] as string[] }));
vi.mock("@/global/database/db", () => ({ db: {} }));
vi.mock("@/db-functions/fieldEdits", () => ({
    readFieldSnapshot: vi.fn(async () => ({ json: "{}" })),
    restoreFieldSnapshot: vi.fn(async () => {
        order.push("restore");
        return true;
    }),
}));

describe("the panel's X (#824)", () => {
    it("puts the field back only after an edit still being written has landed", async () => {
        beginFieldEditSession();
        // Clicking X blurs a text field first: its save starts, then X
        let land!: () => void;
        const save = trackFieldEdit(
            new Promise<void>((resolve) => {
                land = () => {
                    order.push("save");
                    resolve();
                };
            }),
        );
        const discarding = discardFieldEditSession();
        await Promise.resolve();
        expect(order).toEqual([]);
        land();
        await save;
        await expect(discarding).resolves.toBe(true);
        expect(order).toEqual(["save", "restore"]);
    });

    it("still puts the field back when that edit fails", async () => {
        order.length = 0;
        beginFieldEditSession();
        trackFieldEdit(Promise.reject(new Error("refused"))).catch(() => {});
        await expect(discardFieldEditSession()).resolves.toBe(true);
        expect(order).toEqual(["restore"]);
    });
});
