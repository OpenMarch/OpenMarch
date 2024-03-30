import { act, renderHook } from '@testing-library/react';
import { FieldPropertiesProvider, useFieldProperties } from '../fieldPropertiesContext';
import { mockNCAAFieldProperties } from "@/__mocks__/globalMocks";
import { ElectronApi } from 'electron/preload';

window.electron = {
    getFieldProperties: jest.fn().mockResolvedValue(mockNCAAFieldProperties),
} as Partial<ElectronApi> as ElectronApi;
describe('SelectedPageContext', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        jest.mock('@/api/api');
    });

    it('initial field properties should be the passed mock', async () => {
        let result: any = undefined;
        await act(async () => {
            ({ result } = renderHook(() => useFieldProperties(), { wrapper: FieldPropertiesProvider }));
        });
        expect(result).toBeDefined();
        expect(result.current?.fieldProperties).toEqual({ ...mockNCAAFieldProperties });
    })
});
