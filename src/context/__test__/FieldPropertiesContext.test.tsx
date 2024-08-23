import { renderHook, act } from "@testing-library/react";
import {
    FieldPropertiesProvider,
    useFieldProperties,
} from "../fieldPropertiesContext";
import { mockNCAAFieldProperties } from "@/__mocks__/globalMocks";
import { ElectronApi } from "electron/preload";
import { beforeEach, describe, expect, it, vi } from "vitest";

window.electron = {
    getFieldProperties: vi.fn().mockResolvedValue(mockNCAAFieldProperties),
} as Partial<ElectronApi> as ElectronApi;
describe("SelectedPageContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        vi.mock("@/api/api");
    });

    it("initial field properties should be the passed mock", async () => {
        let result: any = undefined;
        await act(async () => {
            ({ result } = renderHook(() => useFieldProperties(), {
                wrapper: FieldPropertiesProvider,
            }));
        });
        expect(result).toBeDefined();
        expect(result.current?.fieldProperties).toEqual({
            ...mockNCAAFieldProperties,
        });
    });
});
