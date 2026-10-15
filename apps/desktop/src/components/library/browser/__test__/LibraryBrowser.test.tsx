import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {
    act,
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import LibraryBrowser, {
    HIGHLIGHT_MS,
    type LibraryHighlight,
} from "../LibraryBrowser";
import { createFakeLibrary, ok } from "../../import/__test__/fakeLibrary";
import {
    itemIdOf,
    libraryItem,
    sampleLibrary,
    serveLibrary,
} from "./libraryFixtures";

let seed = 10;
let created: string[] = [];
let revoked: string[] = [];
const scrolled: Element[] = [];

beforeAll(async () => {
    await tolgee.run();
});
beforeEach(() => {
    created = [];
    revoked = [];
    scrolled.length = 0;
    URL.createObjectURL = vi.fn(() => {
        const url = `blob:test/${created.length}`;
        created.push(url);
        return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
        scrolled.push(this);
    });
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

function renderBrowser(
    props: {
        highlight?: LibraryHighlight | null;
        onHighlightDone?: (seq: number) => void;
    } = {},
) {
    const lib = createFakeLibrary();
    const library = sampleLibrary(seed++);
    serveLibrary(lib, library);
    const view = render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <LibraryBrowser api={lib.api} {...props} />
        </TolgeeProvider>,
    );
    const rerender = (next: typeof props) =>
        view.rerender(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <LibraryBrowser api={lib.api} {...next} />
            </TolgeeProvider>,
        );
    return { lib, library, view, rerender };
}

const namesIn = (group: string) =>
    within(screen.getByTestId(`library-group-${group}`))
        .getAllByTestId("library-item")
        .map((el) => el.textContent);

describe("LibraryBrowser", () => {
    it("groups every item by what it's for, in order", async () => {
        renderBrowser();
        await screen.findByTestId("library-group-silks");
        expect(
            screen
                .getAllByTestId(/^library-group-/)
                .map((el) => el.dataset.testid),
        ).toEqual([
            "library-group-silks",
            "library-group-floors",
            "library-group-props",
            "library-group-equipment",
            "library-group-uniforms",
            "library-group-other",
        ]);
        expect(namesIn("silks")).toEqual(["Away silk", "Home silk"]);
        expect(namesIn("floors")).toEqual(["Field tarp"]);
        expect(namesIn("props")).toEqual(["Riser 8 × 4"]);
        expect(namesIn("uniforms")).toEqual(["Band default"]);
        expect(namesIn("other")).toEqual(["Mystery"]);
    });

    it("shows thumbnails as blob URLs and revokes them on unmount", async () => {
        const { view, library } = renderBrowser();
        await waitFor(() => expect(created).toHaveLength(6));
        const silk = screen.getByTitle("Home silk");
        expect(silk.querySelector("img")?.getAttribute("src")).toMatch(
            /^blob:test\//,
        );
        // No thumbnail: the kind icon stands in.
        expect(
            screen.getByTitle("Riser 8 × 4").querySelector("img"),
        ).toBeNull();
        expect(library).toHaveLength(7);
        view.unmount();
        expect([...revoked].sort()).toEqual([...created].sort());
    });

    it("filters by name and says when nothing matches", async () => {
        renderBrowser();
        await screen.findByTestId("library-group-silks");
        await userEvent.type(screen.getByTestId("library-search"), "SILK");
        expect(screen.getAllByTestId("library-item")).toHaveLength(2);
        expect(screen.queryByTestId("library-group-floors")).toBeNull();
        await userEvent.clear(screen.getByTestId("library-search"));
        await userEvent.type(screen.getByTestId("library-search"), "tuba");
        expect(screen.queryAllByTestId("library-item")).toHaveLength(0);
        expect(screen.getByTestId("library-no-matches")).toHaveTextContent(
            "tuba",
        );
        expect(screen.queryByTestId("library-empty")).toBeNull();
    });

    it("points an empty Library at Import…", async () => {
        const lib = createFakeLibrary();
        lib.on("list", () => ok([]));
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <LibraryBrowser api={lib.api} />
            </TolgeeProvider>,
        );
        expect(await screen.findByTestId("library-empty")).toHaveTextContent(
            "Import…",
        );
    });

    it("shows a failed list inline", async () => {
        const lib = createFakeLibrary();
        lib.on("list", () => ({
            ok: false,
            error: { code: "corrupt", message: "bad index" },
        }));
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <LibraryBrowser api={lib.api} />
            </TolgeeProvider>,
        );
        expect(await screen.findByTestId("library-error")).toHaveTextContent(
            "corrupt",
        );
    });

    it("refreshes on library:changed and fetches only new thumbnails", async () => {
        const { lib, library } = renderBrowser();
        await waitFor(() => expect(created).toHaveLength(6));
        library.push(libraryItem(9999, "artwork", "Winter silk", "silk"));
        act(() => lib.emitChanged({ itemIds: [library[7].summary.id] }));
        await waitFor(() =>
            expect(namesIn("silks")).toEqual([
                "Away silk",
                "Home silk",
                "Winter silk",
            ]),
        );
        await waitFor(() => expect(created).toHaveLength(7));
        expect(
            (
                lib.calls.thumbnails.at(-1) as {
                    items: { itemId: string }[];
                }
            ).items.map((i) => i.itemId),
        ).toEqual([library[7].summary.id]);
    });

    it("rings new items, scrolls to them and fades the ring", async () => {
        const onHighlightDone = vi.fn();
        const { library, rerender } = renderBrowser({ onHighlightDone });
        await screen.findByTestId("library-group-silks");
        await userEvent.type(screen.getByTestId("library-search"), "riser");

        vi.useFakeTimers({ shouldAdvanceTime: true });
        const tarp = itemIdOf(library, "Field tarp");
        rerender({
            onHighlightDone,
            highlight: { itemIds: [tarp], seq: 1 },
        });
        // The search is cleared so the new item shows.
        await waitFor(() =>
            expect(screen.getByTitle("Field tarp")).toHaveAttribute(
                "data-highlighted",
                "true",
            ),
        );
        expect(screen.getByTestId("library-search")).toHaveValue("");
        expect(screen.getByTitle("Home silk")).not.toHaveAttribute(
            "data-highlighted",
        );
        await waitFor(() =>
            expect(scrolled).toContain(screen.getByTitle("Field tarp")),
        );
        expect(onHighlightDone).not.toHaveBeenCalled();
        act(() => void vi.advanceTimersByTime(HIGHLIGHT_MS));
        expect(onHighlightDone).toHaveBeenCalledWith(1);
    });
});
