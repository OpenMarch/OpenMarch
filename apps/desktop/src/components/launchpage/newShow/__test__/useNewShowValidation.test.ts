import { describe, expect, it } from "vitest";
import { useNewShowValidation } from "../hooks/useNewShowValidation";
import { renderHook } from "@testing-library/react";
import {
    DEFAULT_NEW_SHOW_WIZARD_STATE,
    type NewShowWizardState,
} from "../../newShowTypes";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

describe("useNewShowValidation", () => {
    it("requires project name and file location on project step", () => {
        const { result } = renderHook(() =>
            useNewShowValidation(DEFAULT_NEW_SHOW_WIZARD_STATE, "project"),
        );
        expect(result.current).toBe(false);

        const withProject: NewShowWizardState = {
            ...DEFAULT_NEW_SHOW_WIZARD_STATE,
            project: {
                projectName: "My Show",
                fileLocation: "/tmp/my.dots",
            },
        };
        const { result: result2 } = renderHook(() =>
            useNewShowValidation(withProject, "project"),
        );
        expect(result2.current).toBe(true);
    });

    it("allows skip on performers step", () => {
        const { result } = renderHook(() =>
            useNewShowValidation(DEFAULT_NEW_SHOW_WIZARD_STATE, "performers"),
        );
        expect(result.current).toBe(true);
    });

    it("requires field on field step", () => {
        const state: NewShowWizardState = {
            ...DEFAULT_NEW_SHOW_WIZARD_STATE,
            ensemble: {
                environment: "outdoor",
                ensemble_type: "Marching Band",
            },
            field: {
                template:
                    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
                isCustom: false,
            },
        };
        const { result } = renderHook(() =>
            useNewShowValidation(state, "field"),
        );
        expect(result.current).toBe(true);
    });
});
