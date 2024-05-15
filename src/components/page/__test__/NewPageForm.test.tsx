import { render, screen, fireEvent, act, waitFor, renderHook } from '@testing-library/react';
import NewPageForm from '../NewPageForm';
import { NewPageArgs, Page } from '@/global/classes/Page';
import { ElectronApi } from 'electron/preload';
import { mockPages } from '@/__mocks__/globalMocks';
import { usePageStore } from '@/stores/page/usePageStore';



describe('NewPageForm', () => {
    let createPagesSpy: jest.SpyInstance;

    beforeEach(async () => {
        window.electron = {
            createPages: jest.fn().mockResolvedValue({ success: true }),
            updatePages: jest.fn().mockResolvedValue({ success: true }),
        } as Partial<ElectronApi> as ElectronApi;

        jest.spyOn(Page, 'getPages').mockResolvedValue(mockPages);

        Page.fetchPages = jest.fn();
        jest.spyOn(Page, 'getPages').mockResolvedValue(mockPages);
        jest.mock('@/stores/page/usePageStore');

        // Render the component
        render(
            <NewPageForm />
        );
        createPagesSpy = jest.spyOn(Page, 'createPages');
        const { result } = renderHook(() => usePageStore());
        await act(async () => { result.current.fetchPages() });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('submits the form and creates a new page', async () => {
        // Mock the necessary dependencies and props
        const mockCounts = 12;
        const mockTempo = 80;
        const mockQuantity = 1;

        const expectedNewPage: NewPageArgs = {
            isSubset: true,
            counts: mockCounts,
            tempo: mockTempo,
            previousPage: undefined,
        };

        // Fill in the form inputs
        const countsInput = screen.getByLabelText('Counts');
        act(() => fireEvent.change(countsInput, { target: { value: mockCounts } }));

        const quantityInput = screen.getByLabelText('Quantity');
        act(() => fireEvent.change(quantityInput, { target: { value: mockQuantity } }));

        const tempoInput = screen.getByLabelText('Tempo');
        act(() => fireEvent.change(tempoInput, { target: { value: mockTempo } }));

        const isSubsetCheckbox = screen.getByLabelText('Subset');
        act(() => fireEvent.click(isSubsetCheckbox));

        // Submit the form
        const form = screen.getByLabelText('New Page Form');
        act(() => fireEvent.submit(form));

        await waitFor(() => expect(createPagesSpy).toHaveBeenCalledWith([expectedNewPage]));
        await waitFor(() => expect(screen.getByLabelText('create page response')).toBeDefined());
        // Only way I could think of to test success message
        expect(screen.getByLabelText('create page response').className).toContain('alert-success');
    });

    it('submits the form and creates new pages', async () => {
        // Mock the necessary dependencies and props
        const mockCounts = 12;
        const mockTempo = 80;
        const mockQuantity = 3;
        const createPagesSpy = jest.spyOn(Page, 'createPages');

        const expectedNewPages: NewPageArgs[] = [
            {
                previousPage: mockPages[0],
                isSubset: false,
                counts: mockCounts,
                tempo: mockTempo,
            },
            {
                previousPage: mockPages[0],
                isSubset: false,
                counts: mockCounts,
                tempo: mockTempo,
            },
            {
                previousPage: mockPages[0],
                isSubset: false,
                counts: mockCounts,
                tempo: mockTempo,
            }
        ];


        // Fill in the form inputs
        const countsInput = screen.getByLabelText('Counts');
        act(() => fireEvent.change(countsInput, { target: { value: mockCounts } }));

        const quantityInput = screen.getByLabelText('Quantity');
        act(() => fireEvent.change(quantityInput, { target: { value: mockQuantity } }));

        const tempoInput = screen.getByLabelText('Tempo');
        act(() => fireEvent.change(tempoInput, { target: { value: mockTempo } }));

        const previousPageInput = screen.getByLabelText('Select the previous page');
        act(() => fireEvent.change(previousPageInput, { target: { value: mockPages[0].name } }));

        // Submit the form
        const form = screen.getByLabelText('New Page Form');
        act(() => fireEvent.submit(form));

        await waitFor(() => expect(createPagesSpy).toHaveBeenCalledWith(expectedNewPages));
        await waitFor(() => expect(screen.getByLabelText('create page response')).toBeDefined());
        // Only way I could think of to test success message
        expect(screen.getByLabelText('create page response').className).toContain('alert-success');
    });



    it('submits the form and fails', async () => {
        window.electron = {
            createPages: jest.fn().mockResolvedValue({ success: false }),
            updatePages: jest.fn().mockResolvedValue({ success: false }),
        } as Partial<ElectronApi> as ElectronApi;

        // Mock the necessary dependencies and props
        const mockCounts = 12;
        const mockTempo = 80;
        const mockQuantity = 1;

        const expectedNewPage: NewPageArgs = {
            isSubset: true,
            counts: mockCounts,
            tempo: mockTempo,
            previousPage: undefined,
        };

        // Fill in the form inputs
        const countsInput = screen.getByLabelText('Counts');
        act(() => fireEvent.change(countsInput, { target: { value: mockCounts } }));

        const quantityInput = screen.getByLabelText('Quantity');
        act(() => fireEvent.change(quantityInput, { target: { value: mockQuantity } }));

        const tempoInput = screen.getByLabelText('Tempo');
        act(() => fireEvent.change(tempoInput, { target: { value: mockTempo } }));

        const isSubsetCheckbox = screen.getByLabelText('Subset');
        act(() => fireEvent.click(isSubsetCheckbox));

        // Submit the form
        const form = screen.getByLabelText('New Page Form');
        act(() => fireEvent.submit(form));

        // Disable console.error so that the error message doesn't show up in the console
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await waitFor(() => expect(createPagesSpy).toHaveBeenCalledWith([expectedNewPage]));
        await waitFor(() => expect(screen.getByLabelText('create page response')).toBeDefined());
        // Only way I could think of to test success message
        expect(screen.getByLabelText('create page response').className).toContain('alert-danger');

        consoleErrorSpy.mockRestore();
    });
});
