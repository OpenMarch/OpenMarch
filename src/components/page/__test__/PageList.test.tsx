import { render, fireEvent, act, renderHook, within, Matcher, MatcherOptions, ByRoleMatcher, ByRoleOptions } from "@testing-library/react";
import PageList from "../PageList";
import * as api from '@/api/api';
import { mockPages } from "./mocks";
import { usePageStore } from "@/stores/page/usePageStore";
import { Page } from "@/global/Interfaces";

function validatePageRows(pageRows: HTMLElement[], expectedPages: Page[]) {
    pageRows.forEach(pageRow => {
        const pageInRow = {
            name: within(pageRow).getByTitle("Page name").textContent,
            // Use negative one to ensure test fail in case of missing page counts
            counts: parseInt(within(pageRow).getByTitle("Page counts").textContent || "-1"),
        }
        expect(expectedPages).toContainEqual(expect.objectContaining(pageInRow));
    });
}

describe("PageList", () => {
    let updatePagesSpy: jest.SpyInstance;
    beforeAll(async () => {
        jest.mock('@/api/api');
        jest.mock('@/stores/page/usePageStore');

        // Mock the getPages function to return the mockPages array
        jest.spyOn(api, 'getPages').mockResolvedValue(mockPages);

        // Mock the updatePages function to return a resolved promise
        updatePagesSpy = jest.spyOn(api, 'updatePages').mockResolvedValue({ success: true });
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        const { result } = renderHook(() => usePageStore());
        await act(async () => { result.current.fetchPages() });
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
    })

    it("has header when hasHeader prop is true", () => {
        const { getByRole } = render(<PageList hasHeader={true} />);
        expect(getByRole("heading")).toBeDefined();
    })

    it("does not have header when hasHeader prop is false", () => {
        const { queryByRole } = render(<PageList hasHeader={false} />);
        expect(queryByRole("heading")).toBeNull();
    })

    describe("editing", () => {
        async function editPage(
            getAllByTitle: (id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[],
            getAllByRole: (role: ByRoleMatcher, options?: ByRoleOptions | undefined) => HTMLElement[],
            changes: { pageId: number, newCounts?: number, oldPage: Page }[]
        ) {
            // Set the list to editing mode
            const editButton = getAllByRole("button", { name: /edit/i })[0];
            act(() => fireEvent.click(editButton));

            changes.forEach(change => {
                // Make sure that the id for the change matches the old page
                expect(change.oldPage.id).toBe(change.pageId);

                // Get the first row in the table
                const pageRows = getAllByTitle("Page row");
                const pageRow = pageRows.find(row => parseInt(row.getAttribute('data-id')!) === change.pageId);
                expect(pageRow).toBeDefined();
                if (!pageRow) fail("No row found for page id " + change.pageId);

                // validate that the first page's name is not the same as the new name
                expect(change.oldPage.counts).not.toBe(change.newCounts);

                if (change.newCounts) {
                    // Type the new name into the input
                    const countsInput = within(pageRow).getByTitle("Page counts input");
                    act(() => fireEvent.change(countsInput, { target: { value: change.newCounts } }));
                }
            })

            // Click the save button
            const saveButton = getAllByRole("button", { name: /save/i })[0];
            await act(async () => fireEvent.click(saveButton));

            // Validate that the updatePages function was called with the correct arguments
            const updatePageResults = updatePagesSpy.mock.calls[0][0];
            expect(updatePageResults.length).toBe(changes.length);
            updatePageResults.forEach((updatePageResult: { id: number, counts: number }) => {
                const correspondingChange = changes.find(change => change.pageId === updatePageResult.id);
                expect(correspondingChange).toBeDefined();
                if (!correspondingChange) fail("No corresponding change found for page id " + updatePageResult.id);
                expect(updatePageResult.id).toBe(correspondingChange?.pageId);
                expect(updatePageResult.counts).toEqual(correspondingChange.newCounts?.toString() || undefined);
            })
        }

        it("edit a single page's name", async () => {
            const { getAllByTitle, getAllByRole } = render(<PageList />);
            const changes = [
                { pageId: 1, newCounts: 26, oldPage: mockPages[0] }
            ];
            await editPage(getAllByTitle, getAllByRole, changes);
        });

        it("edit multiple pages' counts", async () => {
            const { getAllByTitle, getAllByRole } = render(<PageList />);
            const changes = [
                { pageId: 1, newCounts: 26, oldPage: mockPages[0] },
                { pageId: 2, newCounts: 13, oldPage: mockPages[1] },
                { pageId: 3, newCounts: 58, oldPage: mockPages[2] },
            ];
            await editPage(getAllByTitle, getAllByRole, changes);
        })
    });
});
