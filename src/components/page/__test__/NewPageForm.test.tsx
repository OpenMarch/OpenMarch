import {
    render,
    screen,
    fireEvent,
    waitFor,
    renderHook,
    act,
    cleanup,
} from "@testing-library/react";
import NewPageForm from "../NewPageForm";
import Page, { NewPageArgs } from "@/global/classes/Page";
import { ElectronApi } from "electron/preload";
import { mockPages } from "@/__mocks__/globalMocks";
import { usePageStore } from "@/stores/PageStore";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    MockInstance,
    vi,
} from "vitest";

describe("NewPageForm", () => {
    let createPagesSpy: MockInstance;

    beforeAll(() => {});

    beforeEach(async () => {
        vi.mock("@/stores/page/usePageStore", () => {
            return {
                usePageStore: () => ({
                    pages: mockPages,
                    fetchPages: vi.fn(),
                }),
            };
        });

        window.electron = {
            createPages: vi.fn().mockResolvedValue({ success: true }),
            updatePages: vi.fn().mockResolvedValue({ success: true }),
        } as Partial<ElectronApi> as ElectronApi;

        vi.spyOn(Page, "getPages").mockResolvedValue(mockPages);

        Page.fetchPages = vi.fn();
        vi.spyOn(Page, "getPages").mockResolvedValue(mockPages);

        // Render the component
        render(<NewPageForm />);
        createPagesSpy = vi.spyOn(Page, "createPages");
        const { result } = renderHook(() => usePageStore());
        await act(async () => {
            result.current.fetchPages();
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        cleanup();
    });

    it("submits the form and creates a new page", async () => {
        // Mock the necessary dependencies and props
        const mockCounts = 12;
        const mockQuantity = 1;

        const expectedNewPage: NewPageArgs = {
            isSubset: true,
            counts: mockCounts,
            previousPage: undefined,
        };

        // Fill in the form inputs
        const countsInput = screen.getByLabelText("Counts");
        act(() =>
            fireEvent.change(countsInput, { target: { value: mockCounts } })
        );

        const quantityInput = screen.getByLabelText("Quantity");
        act(() =>
            fireEvent.change(quantityInput, { target: { value: mockQuantity } })
        );

        const isSubsetCheckbox = screen.getByLabelText("Subset");
        act(() => fireEvent.click(isSubsetCheckbox));

        // Submit the form
        const form = screen.getByLabelText("New Page Form");
        act(() => fireEvent.submit(form));

        await waitFor(() =>
            expect(createPagesSpy).toHaveBeenCalledWith([expectedNewPage])
        );
        await waitFor(() =>
            expect(screen.getByLabelText("create page response")).toBeDefined()
        );
        // Only way I could think of to test success message
        expect(screen.getByTitle("form alert").className).toContain(
            "alert-success"
        );
    });

    it("submits the form and creates new pages", async () => {
        // Mock the necessary dependencies and props
        const mockCounts = 12;
        const mockQuantity = 3;
        const createPagesSpy = vi.spyOn(Page, "createPages");

        const expectedNewPages: NewPageArgs[] = [
            {
                previousPage: mockPages[0],
                isSubset: false,
                counts: mockCounts,
            },
            {
                previousPage: mockPages[0],
                isSubset: false,
                counts: mockCounts,
            },
            {
                previousPage: mockPages[0],
                isSubset: false,
                counts: mockCounts,
            },
        ];

        // Fill in the form inputs
        const countsInput = screen.getByLabelText("Counts");
        act(() =>
            fireEvent.change(countsInput, { target: { value: mockCounts } })
        );

        const quantityInput = screen.getByLabelText("Quantity");
        act(() =>
            fireEvent.change(quantityInput, { target: { value: mockQuantity } })
        );

        const previousPageInput = screen.getByLabelText(
            "Select the previous page"
        );
        act(() =>
            fireEvent.change(previousPageInput, {
                target: { value: mockPages[0].name },
            })
        );

        // Submit the form
        const form = screen.getByLabelText("New Page Form");
        act(() => fireEvent.submit(form));

        await waitFor(() =>
            expect(createPagesSpy).toHaveBeenCalledWith(expectedNewPages)
        );
        await waitFor(() =>
            expect(screen.getByLabelText("create page response")).toBeDefined()
        );
        // Only way I could think of to test success message
        expect(screen.getByTitle("form alert").className).toContain(
            "alert-success"
        );
    });

    it("submits the form and fails", async () => {
        window.electron = {
            createPages: vi.fn().mockResolvedValue({ success: false }),
            updatePages: vi.fn().mockResolvedValue({ success: false }),
        } as Partial<ElectronApi> as ElectronApi;

        // Mock the necessary dependencies and props
        const mockCounts = 12;
        const mockQuantity = 1;

        const expectedNewPage: NewPageArgs = {
            isSubset: true,
            counts: mockCounts,
            previousPage: undefined,
        };

        // Fill in the form inputs
        const countsInput = screen.getByLabelText("Counts");
        act(() =>
            fireEvent.change(countsInput, { target: { value: mockCounts } })
        );

        const quantityInput = screen.getByLabelText("Quantity");
        act(() =>
            fireEvent.change(quantityInput, { target: { value: mockQuantity } })
        );

        const isSubsetCheckbox = screen.getByLabelText("Subset");
        act(() => fireEvent.click(isSubsetCheckbox));

        // Submit the form
        const form = screen.getByLabelText("New Page Form");
        act(() => fireEvent.submit(form));

        // Disable console.error so that the error message doesn't show up in the console
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});

        await waitFor(() =>
            expect(createPagesSpy).toHaveBeenCalledWith([expectedNewPage])
        );
        await waitFor(() =>
            expect(screen.getByLabelText("create page response")).toBeDefined()
        );
        // Only way I could think of to test success message
        expect(screen.getByTitle("form alert").className).toContain(
            "alert-error"
        );

        consoleErrorSpy.mockRestore();
    });
});
