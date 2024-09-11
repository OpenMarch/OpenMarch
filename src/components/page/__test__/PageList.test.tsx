import {
    render,
    fireEvent,
    renderHook,
    within,
    Matcher,
    MatcherOptions,
    ByRoleMatcher,
    ByRoleOptions,
    act,
    cleanup,
} from "@testing-library/react";
import PageList from "../PageList";
import { mockPages } from "@/__mocks__/globalMocks";
import { usePageStore } from "@/stores/page/usePageStore";
import Page from "@/global/classes/Page";
import {
    beforeEach,
    describe,
    expect,
    it,
    MockInstance,
    vi,
    afterEach,
} from "vitest";

function validatePageRows(pageRows: HTMLElement[], expectedPages: Page[]) {
    const sortedExpectedPages = Page.sortPagesByOrder(expectedPages);
    for (let i = 0; i < sortedExpectedPages.length; i++) {
        const pageRow = pageRows[i];
        const page = sortedExpectedPages[i];
        expect(within(pageRow).getByTitle("Page name").textContent).toBe(
            page.name
        );
        const counts = parseInt(
            within(pageRow).getByTitle("Page counts").textContent?.trim() ||
                "-1"
        );
        expect(counts).toBe(i === 0 ? 0 : page.counts);
    }
}

function createModifiedPages(
    changes: { pageId: number; newCounts?: number }[]
) {
    return changes.map((change) => {
        return { id: change.pageId, counts: change.newCounts?.toString() };
    });
}

describe("PageList", () => {
    let updatePagesSpy: MockInstance;

    beforeEach(async () => {
        vi.mock("@/stores/page/usePageStore", () => {
            return {
                usePageStore: () => ({
                    pages: mockPages,
                    fetchPages: vi.fn(),
                }),
            };
        });

        // Mock the getPages function to return the mockPages array
        vi.spyOn(Page, "getPages").mockResolvedValue(mockPages);

        // Mock the updatePages function to return a resolved promise
        updatePagesSpy = vi
            .spyOn(Page, "updatePages")
            .mockResolvedValue({ success: true });

        const { result } = renderHook(() => usePageStore());
        await act(async () => {
            result.current.fetchPages();
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        cleanup();
    });

    it("renders without errors", () => {
        render(<PageList />);
    });

    it("displays the correct number of pages", () => {
        const { getAllByTitle } = render(<PageList />);
        expect(getAllByTitle("Page row")).toHaveLength(mockPages.length);
    });

    it("displays the correct information for each page", () => {
        const { getAllByTitle } = render(<PageList />);
        const pageRows = getAllByTitle("Page row");
        validatePageRows(pageRows, mockPages);
    });

    it("has header when hasHeader prop is true", () => {
        const { getByRole } = render(<PageList hasHeader={true} />);
        expect(getByRole("heading")).toBeDefined();
    });

    it("does not have header when hasHeader prop is false", () => {
        const { queryByRole } = render(<PageList hasHeader={false} />);
        expect(queryByRole("heading")).toBeNull();
    });

    describe("editing", () => {
        async function editPage(
            getAllByTitle: (
                id: Matcher,
                options?: MatcherOptions | undefined
            ) => HTMLElement[],
            getAllByRole: (
                role: ByRoleMatcher,
                options?: ByRoleOptions | undefined
            ) => HTMLElement[],
            changes: { pageId: number; newCounts?: number; oldPage: Page }[]
        ) {
            // Set the list to editing mode
            const editButton = getAllByRole("button", { name: /edit/i })[0];
            act(() => fireEvent.click(editButton));

            changes.forEach((change) => {
                // Make sure that the id for the change matches the old page
                expect(change.oldPage.id).toBe(change.pageId);

                // Get the first row in the table
                const pageRows = getAllByTitle("Page row");
                const pageRow = pageRows.find(
                    (row) =>
                        parseInt(row.getAttribute("data-id")!) === change.pageId
                );
                expect(pageRow).toBeDefined();
                if (!pageRow)
                    throw new Error(
                        "No row found for page id " + change.pageId
                    );

                // validate that the first page's name is not the same as the new name
                expect(change.oldPage.counts).not.toBe(change.newCounts);

                if (change.newCounts) {
                    // Type the new name into the input
                    const countsInput =
                        within(pageRow).getByTitle("Page counts input");
                    act(() =>
                        fireEvent.change(countsInput, {
                            target: { value: change.newCounts },
                        })
                    );
                }
            });

            // Click the save button
            const saveButton = getAllByRole("button", { name: /save/i })[0];
            await act(async () => fireEvent.click(saveButton));

            // Validate that the updatePages function was called with the correct arguments
            const updatePageResults = updatePagesSpy.mock.calls[0][0];
            expect(updatePageResults.length).toBe(changes.length);
            updatePageResults.forEach(
                (updatePageResult: { id: number; counts: number }) => {
                    const correspondingChange = changes.find(
                        (change) => change.pageId === updatePageResult.id
                    );
                    expect(correspondingChange).toBeDefined();
                    if (!correspondingChange)
                        throw new Error(
                            "No corresponding change found for page id " +
                                updatePageResult.id
                        );
                    expect(updatePageResult.id).toBe(
                        correspondingChange?.pageId
                    );
                    expect(updatePageResult.counts).toEqual(
                        correspondingChange.newCounts?.toString() || undefined
                    );
                }
            );
        }

        it("edit a single page's name", async () => {
            const { getAllByTitle, getAllByRole } = render(<PageList />);
            const changes = [
                { pageId: 1, newCounts: 26, oldPage: mockPages[0] },
            ];
            await editPage(getAllByTitle, getAllByRole, changes);

            expect(updatePagesSpy).toHaveBeenCalledWith(
                createModifiedPages(changes)
            );
        });

        it("edit multiple pages' counts", async () => {
            const { getAllByTitle, getAllByRole } = render(<PageList />);
            const changes = [
                { pageId: 1, newCounts: 26, oldPage: mockPages[0] },
                { pageId: 2, newCounts: 13, oldPage: mockPages[1] },
                { pageId: 3, newCounts: 58, oldPage: mockPages[2] },
            ];
            await editPage(getAllByTitle, getAllByRole, changes);
            expect(updatePagesSpy).toHaveBeenCalledWith(
                createModifiedPages(changes)
            );
        });
    });
});
