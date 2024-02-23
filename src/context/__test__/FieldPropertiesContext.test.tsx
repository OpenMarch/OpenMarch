import { act, renderHook } from '@testing-library/react';
import { FieldPropertiesProvider, useFieldProperties } from '../fieldPropertiesContext';
import * as api from '@/api/api';
import { mockV1FieldProperties } from "./mocks";

describe('SelectedPageContext', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        jest.mock('@/api/api');
        jest.spyOn(api, 'getFieldProperties').mockResolvedValue(mockV1FieldProperties);
    });

    it('initial field properties should be the passed mock', async () => {
        let result: any = undefined;
        await act(async () => {
            ({ result } = renderHook(() => useFieldProperties(), { wrapper: FieldPropertiesProvider }));
        });
        expect(result).toBeDefined();
        expect(result.current?.fieldProperties).toEqual({ ...mockV1FieldProperties });
    })
});
