import { renderHook, act } from "@testing-library/react";
import {
    FieldPropertiesProvider,
    useFieldProperties,
} from "../fieldPropertiesContext";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestSqlProxy } from "@/__mocks__/TestSqlProxy";

describe("SelectedPageContext", () => {
    beforeEach(async () => {
        await setupTestSqlProxy();
    });

    it("initial field properties should be defined", async () => {
        let result: any = undefined;
        await act(async () => {
            ({ result } = renderHook(() => useFieldProperties(), {
                wrapper: FieldPropertiesProvider,
            }));
        });
        expect(result).toBeDefined();
        expect(result.current.fieldProperties).toBeDefined();
        expect(result.current.fieldProperties.name).toEqual(
            "High school football field (no end zones)",
        );
    });
});
