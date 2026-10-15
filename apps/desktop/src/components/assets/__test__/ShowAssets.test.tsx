import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import type { ShowLibraryItem } from "@/db-functions/showLibrary";
import type { LibraryItemSummary } from "@/view3d/library/protocol";
import {
    createFakeLibrary,
    ok,
} from "@/components/library/import/__test__/fakeLibrary";
import ShowAssets from "../ShowAssets";
import { h, librarySummary, showItem } from "./showFixtures";

let show: ShowLibraryItem[] = [];
vi.mock("@/hooks/queries/useShowLibrary", () => ({
    useShowLibrary: () => ({ data: show }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => {
    cleanup();
    show = [];
});

function setup(library: LibraryItemSummary[]) {
    const lib = createFakeLibrary();
    lib.on("list", () => ok(library));
    const blobs: Record<string, Uint8Array> = {
        [h("d")]: new Uint8Array([1, 2]),
        [h("e")]: new TextEncoder().encode('{"surface":"silk"}'),
    };
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <ShowAssets api={lib.api} readBlob={async (hash) => blobs[hash]} />
        </TolgeeProvider>,
    );
    return lib;
}

describe("This show", () => {
    it("lists what the show embeds and adds a missing item to the Library from the show's copy", async () => {
        const kept = showItem(1, "Kept silk");
        const missing = showItem(2, "Shared silk");
        show = [kept, missing];
        const lib = setup([librarySummary(kept)]);
        lib.on("addFromShow", () =>
            ok({ outcome: "created", item: { id: missing.itemId } }),
        );

        const silks = await screen.findByTestId("show-group-silks");
        const rows = within(silks).getAllByTestId("show-item");
        expect(rows.map((r) => r.getAttribute("title"))).toEqual([
            "Kept silk",
            "Shared silk",
        ]);
        await waitFor(() =>
            expect(within(rows[1]).getByTestId("show-item-add")).toBeVisible(),
        );
        expect(within(rows[0]).queryByTestId("show-item-add")).toBeNull();

        await userEvent.click(within(rows[1]).getByTestId("show-item-add"));
        await waitFor(() => expect(lib.calls.addFromShow).toHaveLength(1));
        expect(lib.calls.addFromShow[0]).toMatchObject({
            itemId: missing.itemId,
            versionHash: missing.versionHash,
            name: "Shared silk",
            parts: { display: new Uint8Array([1, 2]) },
            license: { license: "LicenseRef-Unknown" },
        });
    });

    it("notes a newer Version in the Library without applying it", async () => {
        const behind = showItem(1, "Behind silk");
        show = [behind];
        setup([
            librarySummary(behind, { versions: [behind.versionHash, h("f")] }),
        ]);
        expect(await screen.findByTestId("show-item-update")).toHaveTextContent(
            "A newer version is in your Library.",
        );
    });

    it("offers no Add while the Library can't be read", async () => {
        show = [showItem(1, "Silk")];
        const lib = createFakeLibrary();
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <ShowAssets api={lib.api} readBlob={async () => undefined} />
            </TolgeeProvider>,
        );
        await waitFor(() => expect(lib.calls.list).toHaveLength(1));
        expect(screen.queryByTestId("show-item-add")).toBeNull();
    });

    it("says when the show uses nothing yet", () => {
        setup([]);
        expect(
            screen.getByText("This show doesn't use any assets yet."),
        ).toBeVisible();
    });
});
