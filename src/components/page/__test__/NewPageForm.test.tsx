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

// TODO - fix this component. Getting error: `Tooltip` must be used within `TooltipProvider`
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

        // Mock the ResizeObserver
        const ResizeObserverMock = vi.fn(() => ({
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn(),
        }));
        // Stub the global ResizeObserver
        vi.stubGlobal("ResizeObserver", ResizeObserverMock);

        vi.spyOn(Page, "createPages").mockResolvedValue({
            success: true,
            data: mockPages,
        });
        vi.spyOn(Page, "getPages").mockResolvedValue(mockPages);

        Page.fetchPages = vi.fn();

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
            previousPageId: 3,
        };

        // Fill in the form inputs
        const countsInput = screen.getByLabelText("Counts");
        act(() =>
            fireEvent.change(countsInput, { target: { value: mockCounts } }),
        );

        const quantityInput = screen.getByLabelText("Quantity");
        act(() =>
            fireEvent.change(quantityInput, {
                target: { value: mockQuantity },
            }),
        );

        const isSubsetCheckbox = screen.getByLabelText("Subset");
        act(() => fireEvent.click(isSubsetCheckbox));

        // Submit the form
        const form = screen.getByTestId("page-form-submit");
        act(() => fireEvent.submit(form));

        await waitFor(() =>
            expect(createPagesSpy).toHaveBeenCalledWith([expectedNewPage]),
        );
        await waitFor(() =>
            expect(
                screen.findByText("Page 4 created successfully"),
            ).toBeDefined(),
        );
    });

    // TODO - Can't find any way to select and modify the previous page
    it.skip("submits the form and creates new pages", async () => {
        // Mock the necessary dependencies and props
        const mockCounts = 12;
        const mockQuantity = 3;
        const createPagesSpy = vi.spyOn(Page, "createPages");

        const expectedNewPages: NewPageArgs[] = [
            {
                previousPageId: mockPages[0].id,
                isSubset: false,
                counts: mockCounts,
            },
            {
                previousPageId: mockPages[0].id,
                isSubset: false,
                counts: mockCounts,
            },
            {
                previousPageId: mockPages[0].id,
                isSubset: false,
                counts: mockCounts,
            },
        ];

        // Fill in the form inputs
        const countsInput = screen.getByLabelText("Counts");
        act(() =>
            fireEvent.change(countsInput, { target: { value: mockCounts } }),
        );

        const quantityInput = screen.getByLabelText("Quantity");
        act(() =>
            fireEvent.change(quantityInput, {
                target: { value: mockQuantity },
            }),
        );

        const previousPageInput = screen.getByLabelText(
            "Select the previous page",
        );
        act(() =>
            fireEvent.change(previousPageInput, {
                target: { value: mockPages[0].name },
            }),
        );

        // Submit the form
        const form = screen.getByTestId("page-form-submit");
        act(() => fireEvent.submit(form));

        await waitFor(() =>
            expect(createPagesSpy).toHaveBeenCalledWith(expectedNewPages),
        );
        await waitFor(() =>
            expect(
                screen.getByLabelText("Page 4 created successfully"),
            ).toBeDefined(),
        );
    });

    it("submits the form and fails", async () => {
        const mockResponse = {
            success: false,
            data: [],
            error: { message: "This is an error message" },
        };
        const failCreatePagesSpy = vi
            .spyOn(Page, "createPages")
            .mockResolvedValue(mockResponse);

        // Mock the necessary dependencies and props
        const mockCounts = 12;
        const mockQuantity = 1;

        const expectedNewPage: NewPageArgs = {
            isSubset: true,
            counts: mockCounts,
            previousPageId: 3,
        };

        // Fill in the form inputs
        const countsInput = screen.getByLabelText("Counts");
        act(() =>
            fireEvent.change(countsInput, { target: { value: mockCounts } }),
        );

        const quantityInput = screen.getByLabelText("Quantity");
        act(() =>
            fireEvent.change(quantityInput, {
                target: { value: mockQuantity },
            }),
        );

        const isSubsetCheckbox = screen.getByLabelText("Subset");
        act(() => fireEvent.click(isSubsetCheckbox));

        // Submit the form
        const form = screen.getByTestId("page-form-submit");
        act(() => fireEvent.submit(form));

        // Disable console.error so that the error message doesn't show up in the console
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});

        await waitFor(() =>
            expect(failCreatePagesSpy).toHaveBeenCalledWith([expectedNewPage]),
        );
        await waitFor(() =>
            expect(
                screen.findByText(
                    "Error creating pages: This is an error message",
                ),
            ).toBeDefined(),
        );

        consoleErrorSpy.mockRestore();
    });
});
