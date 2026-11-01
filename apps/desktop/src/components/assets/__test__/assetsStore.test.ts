// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportedVersion } from "@/view3d/library/showLibraryEmbed";

const pick = vi.fn(async () => {});
const close = vi.fn();
let options: {
    onImported?: (saved: ImportedVersion[]) => void;
} = {};

vi.mock("@/components/library/import/importReview", () => ({
    createImportReview: (_client: unknown, opts: typeof options) => {
        options = opts;
        return { getState: () => ({ pick, close }) };
    },
}));

const { useAssetsStore } = await import("../assetsStore");

const saved = [
    {
        item: { id: "floor-item", name: "Tarp" },
        versionHash: "f".repeat(64),
    },
] as unknown as ImportedVersion[];

describe("assetsStore.startImport", () => {
    afterEach(() => {
        useAssetsStore.setState({ review: null, onImported: null });
        vi.clearAllMocks();
    });

    it("picks any file by default", () => {
        useAssetsStore.getState().startImport({} as never);
        expect(pick).toHaveBeenCalledWith("any", undefined);
    });

    it("passes a picker's purpose and context, so the review is pre-filled", () => {
        const context = { surface: "baseFloor" as const };
        useAssetsStore
            .getState()
            .startImport({} as never, { purpose: "artwork", context });
        expect(pick).toHaveBeenCalledWith("artwork", context);
    });

    it("runs onEmbedded only once the show holds its copy", async () => {
        const order: string[] = [];
        useAssetsStore.getState().setOnImported(async () => {
            await Promise.resolve();
            order.push("embedded");
        });
        const onEmbedded = vi.fn(async () => {
            order.push("onEmbedded");
        });
        useAssetsStore.getState().startImport({} as never, { onEmbedded });

        options.onImported?.(saved);
        await vi.waitFor(() => expect(onEmbedded).toHaveBeenCalled());
        expect(onEmbedded).toHaveBeenCalledWith(saved);
        expect(order).toEqual(["embedded", "onEmbedded"]);
    });

    it("skips onEmbedded when the show's copy failed", async () => {
        useAssetsStore.getState().setOnImported(async () => {
            throw new Error("no copy");
        });
        const onEmbedded = vi.fn();
        useAssetsStore.getState().startImport({} as never, { onEmbedded });

        options.onImported?.(saved);
        await new Promise((r) => setTimeout(r, 0));
        expect(onEmbedded).not.toHaveBeenCalled();
    });

    it("skips onEmbedded when no embed is registered, since nothing was copied", async () => {
        const onEmbedded = vi.fn();
        useAssetsStore.getState().startImport({} as never, { onEmbedded });
        options.onImported?.(saved);
        await new Promise((r) => setTimeout(r, 0));
        expect(onEmbedded).not.toHaveBeenCalled();
    });
});
