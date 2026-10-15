import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import type { ShowLibraryItem } from "@/db-functions/showLibrary";
import ShowCredits, { ShareNoteExportLine } from "../ShowCredits";

let items: ShowLibraryItem[] = [];
vi.mock("@/hooks/queries/useShowLibrary", () => ({
    useShowLibrary: () => ({ data: items }),
}));

let next = 0;
function item(
    name: string,
    license: string,
    patch: Partial<ShowLibraryItem> & {
        meta?: Partial<ShowLibraryItem["metadata"]>;
    } = {},
): ShowLibraryItem {
    const { meta, ...rest } = patch;
    return {
        itemId: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
        versionHash: "a".repeat(64),
        kind: "artwork",
        name,
        builtIn: false,
        metadata: {
            tags: [],
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
            originalFilename: null,
            derivedFrom: null,
            license,
            licenseText: null,
            author: null,
            sourceUrl: null,
            attribution: null,
            modified: false,
            ...meta,
        },
        pins: [],
        parts: {},
        sidecar: null,
        embeddedAt: "2026-10-01T00:00:00.000Z",
        ...rest,
    };
}

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => {
    cleanup();
    items = [];
});

function renderWith(node: React.ReactNode) {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            {node}
        </TolgeeProvider>,
    );
}

describe("ShowCredits", () => {
    it("lists a CC-BY and an Unknown item, counts the rest and shows the Share note", async () => {
        items = [
            item("Sunrise silk", "CC-BY-4.0", {
                meta: {
                    author: "Ana",
                    sourceUrl: "https://example.com/sunrise",
                    modified: true,
                },
            }),
            item("Mystery flag", "LicenseRef-Unknown"),
            item("Plain floor", "CC0-1.0"),
            item("Riser", "CC-BY-4.0", { builtIn: true }),
        ];
        renderWith(<ShowCredits />);
        expect(screen.getByTestId("share-note-badge")).toHaveTextContent(
            "Share note",
        );
        await userEvent.click(screen.getByText("Credits"));
        expect(screen.getByTestId("credits-group-CC-BY-4.0")).toHaveTextContent(
            "Sunrise silk — Ana — CC-BY-4.0 — https://example.com/sunrise (modified)",
        );
        expect(
            screen.getByTestId("credits-group-LicenseRef-Unknown"),
        ).toHaveTextContent("Mystery flag — Unknown license");
        expect(screen.getByTestId("credits-uncredited")).toHaveTextContent(
            "2 more items are CC0 or built in and need no credit.",
        );
        expect(
            screen.getByText(/You may not have the right to share/),
        ).toBeVisible();
    });

    it("has no Share note without Unknown items", () => {
        items = [item("Sunrise silk", "CC-BY-4.0")];
        renderWith(<ShowCredits />);
        expect(screen.queryByTestId("share-note-badge")).toBeNull();
    });

    it("says so when nothing needs a credit", async () => {
        items = [item("Plain floor", "CC0-1.0")];
        renderWith(<ShowCredits />);
        await userEvent.click(screen.getByText("Credits"));
        expect(
            screen.getByText("Nothing in this show needs a credit."),
        ).toBeVisible();
        expect(screen.getByTestId("credits-uncredited")).toHaveTextContent(
            "1 more item is CC0 or built in and needs no credit.",
        );
    });
});

describe("ShareNoteExportLine", () => {
    it("shows one quiet line only for Unknown items", () => {
        items = [item("Sunrise silk", "CC-BY-4.0")];
        renderWith(<ShareNoteExportLine />);
        expect(screen.queryByTestId("share-note-export")).toBeNull();
        cleanup();
        items = [item("Mystery flag", "LicenseRef-Unknown")];
        renderWith(<ShareNoteExportLine />);
        expect(screen.getByTestId("share-note-export")).toHaveTextContent(
            "may not have the right to share",
        );
    });
});
