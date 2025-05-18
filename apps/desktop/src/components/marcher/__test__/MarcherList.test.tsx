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
import MarcherList from "../MarcherList";
import { mockMarchers } from "@/__mocks__/globalMocks";
import { useMarcherStore } from "@/stores/MarcherStore";
import { Marcher } from "@/global/classes/Marcher";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    MockInstance,
    vi,
} from "vitest";

describe("MarcherList", () => {
    const validateMarcherRows = (
        marcherRows: HTMLElement[],
        expectedMarchers: Marcher[],
    ) => {
        for (const marcherRow of marcherRows) {
            const marcherInRow = {
                drill_number: within(marcherRow).getByTestId(
                    "marcher-drill-number",
                ).textContent,
                section:
                    within(marcherRow).getByTestId("marcher-section")
                        .textContent,
                name: within(marcherRow).getByTestId("marcher-name")
                    .textContent,
            };
            const marcherToCompare = mockMarchers.find(
                (marcher) => marcher.drill_number === marcherInRow.drill_number,
            );

            expect(marcherToCompare).toBeDefined();
            expect(marcherToCompare?.section).toEqual(marcherInRow.section);
            expect(marcherToCompare?.name).toEqual(marcherInRow.name);
        }
    };

    let updateMarchersSpy: MockInstance;

    beforeEach(async () => {
        // Mock the getMarchers function to return the mockMarchers array
        vi.spyOn(Marcher, "getMarchers").mockResolvedValue(mockMarchers);

        // Mock the updateMarchers function to return a resolved promise
        updateMarchersSpy = vi
            .spyOn(Marcher, "updateMarchers")
            .mockResolvedValue({ success: true, data: [] });

        vi.mock("@/stores/marcher/useMarcherStore", () => {
            return {
                useMarcherStore: () => ({
                    marchers: mockMarchers,
                    fetchMarchers: vi.fn(),
                }),
            };
        });

        const { result } = renderHook(() => useMarcherStore());
        await act(async () => {
            result.current.fetchMarchers();
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        cleanup();
    });

    it("renders without errors", () => {
        render(<MarcherList />);
    });

    it("displays the correct number of marchers", () => {
        const { getAllByTestId } = render(<MarcherList />);
        expect(getAllByTestId("marcher row")).toHaveLength(mockMarchers.length);
    });

    it("displays the correct information for each marcher", () => {
        const { getAllByTestId } = render(<MarcherList />);
        const marcherRows = getAllByTestId("marcher row");
        validateMarcherRows(marcherRows, mockMarchers);
    });

    // Header was removed. TODO - add this test back or remove if we're not going to have a header.
    it.skip("has header when hasHeader prop is true", () => {
        const { getByRole } = render(<MarcherList hasHeader={true} />);
        expect(getByRole("heading")).toBeDefined();
    });

    it("does not have header when hasHeader prop is false", () => {
        const { queryByRole } = render(<MarcherList hasHeader={false} />);
        expect(queryByRole("heading")).toBeNull();
    });

    // TODO - fix these tests. Isn't showing the "edit" UX
    // https://github.com/OpenMarch/OpenMarch/issues/254
    describe.skip("editing", () => {
        async function editMarcher(
            getAllByTestId: (
                id: Matcher,
                options?: MatcherOptions | undefined,
            ) => HTMLElement[],
            getAllByRole: (
                role: ByRoleMatcher,
                options?: ByRoleOptions | undefined,
            ) => HTMLElement[],
            changes: {
                marcherId: number;
                newName?: string;
                newSection?: string;
                oldMarcher: Marcher;
            }[],
        ) {
            // Set the list to editing mode
            const editButton = getAllByRole("button", { name: /edit/i })[0];
            act(() => fireEvent.click(editButton));

            changes.forEach((change) => {
                // Make sure that the id for the change matches the old marcher
                expect(change.oldMarcher.id).toBe(change.marcherId);

                // Get the first row in the table
                const marcherRows = getAllByTestId(`marcher row`);
                expect(marcherRows).toBeDefined();
                const marcherRow = marcherRows.find((row) => {
                    return (
                        row.id ===
                        `${change.oldMarcher.drill_number} marcher row`
                    );
                });
                expect(marcherRow).toBeDefined();

                if (change.newName) {
                    // validate that the marcher's old name is not the same as the new name (for testing purposes only, this is not a real requirement of the app)
                    expect(change.oldMarcher.name).not.toBe(change.newName);
                    // Type the new name into the input
                    const nameInput = within(marcherRow!).getByTitle(
                        "Marcher name input",
                    );
                    act(() =>
                        fireEvent.change(nameInput, {
                            target: { value: change.newName },
                        }),
                    );
                }

                if (change.newSection) {
                    // validate that the marcher's old section is not the same as the new section (for testing purposes only, this is not a real requirement of the app)
                    expect(change.oldMarcher.section).not.toBe(
                        change.newSection,
                    );
                    // Type the new section into the input
                    const sectionInput = within(marcherRow!).getByTitle(
                        "Marcher section input",
                    );
                    act(() =>
                        fireEvent.change(sectionInput, {
                            target: { value: change.newSection },
                        }),
                    );
                }
            });

            // Click the save button
            const saveButton = getAllByRole("button", { name: /save/i })[0];
            await act(async () => fireEvent.click(saveButton));

            // Validate that the updateMarchers function was called with the correct arguments
            const updateMarcherResults = updateMarchersSpy.mock.calls[0][0];
            expect(updateMarcherResults.length).toBe(changes.length);
            updateMarcherResults.forEach(
                (updateMarcherResult: {
                    id: number;
                    name: string;
                    section: string;
                }) => {
                    const correspondingChange = changes.find(
                        (change) => change.marcherId === updateMarcherResult.id,
                    );
                    expect(correspondingChange).toBeDefined();

                    if (!correspondingChange) {
                        console.error(
                            "No corresponding change found for marcher id",
                        );
                        return;
                    }
                    expect(updateMarcherResult.id).toBe(
                        correspondingChange?.marcherId,
                    );
                    expect(updateMarcherResult.name).toBe(
                        correspondingChange.newName || undefined,
                    );
                    expect(updateMarcherResult.section).toBe(
                        correspondingChange.newSection || undefined,
                    );
                },
            );
        }

        it("edit a single marcher's name", async () => {
            const { getAllByTestId, getAllByRole } = render(<MarcherList />);
            const changes = [
                {
                    marcherId: 1,
                    newName: "Gordon Freeman",
                    oldMarcher: mockMarchers[0],
                },
            ];
            await editMarcher(getAllByTestId, getAllByRole, changes);
        });

        it("edit a single marcher's section", async () => {
            const { getAllByTestId, getAllByRole } = render(<MarcherList />);

            const changes = [
                {
                    marcherId: 1,
                    newSection: "Tuba",
                    oldMarcher: mockMarchers[0],
                },
            ];
            await editMarcher(getAllByTestId, getAllByRole, changes);
        });

        it("edit section and name for a single marcher", async () => {
            const { getAllByTestId, getAllByRole } = render(<MarcherList />);
            const changes = [
                {
                    marcherId: 1,
                    newName: "Gordon Freeman",
                    newSection: "Tuba",
                    oldMarcher: mockMarchers[0],
                },
            ];
            await editMarcher(getAllByTestId, getAllByRole, changes);
        });

        it("edit the section and name for multiple marchers", async () => {
            const { getAllByTestId, getAllByRole } = render(<MarcherList />);
            const changes = [
                {
                    marcherId: 1,
                    newName: "Ross Geller",
                    newSection: "Snare",
                    oldMarcher: mockMarchers.find(
                        (marcher) => marcher.id === 1,
                    )!,
                },
                {
                    marcherId: 2,
                    newName: "Joey Tribbiani",
                    newSection: "Rifle",
                    oldMarcher: mockMarchers.find(
                        (marcher) => marcher.id === 2,
                    )!,
                },
                {
                    marcherId: 3,
                    newName: "Chandler Bing",
                    newSection: "Alto Sax",
                    oldMarcher: mockMarchers.find(
                        (marcher) => marcher.id === 3,
                    )!,
                },
            ];
            await editMarcher(getAllByTestId, getAllByRole, changes);
        });
    });
});
