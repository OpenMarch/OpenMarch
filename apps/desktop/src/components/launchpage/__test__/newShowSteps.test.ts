// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
    DEFAULT_NEW_SHOW_WIZARD_STATE,
    getWizardSteps,
    wizardStateToFormState,
    type NewShowWizardState,
} from "../newShowTypes";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

const withActivity = (activity: string): NewShowWizardState => ({
    ...DEFAULT_NEW_SHOW_WIZARD_STATE,
    start: { mode: "blank" },
    ensemble: { activity },
});

describe("getWizardSteps", () => {
    it("asks for a blank show's activity on the Field step, not a step of its own", () => {
        expect(getWizardSteps(withActivity("Marching Band"))).toEqual([
            "start",
            "project",
            "field",
            "performers",
            "frontEnsemble",
            "audio",
            "tempo",
        ]);
    });

    it("keeps the Activity step for a show from a previous file, which has no Field step", () => {
        expect(
            getWizardSteps({
                ...DEFAULT_NEW_SHOW_WIZARD_STATE,
                start: { mode: "importPrevious" },
            }),
        ).toEqual(["start", "project", "ensemble", "audio", "tempo"]);
    });

    it("skips the Front ensemble step for Winter Guard", () => {
        expect(getWizardSteps(withActivity("Winter Guard"))).not.toContain(
            "frontEnsemble",
        );
    });

    it("keeps it for activities with a pit", () => {
        for (const activity of [
            "Indoor Percussion",
            "Indoor Winds",
            "Marching Band",
        ])
            expect(getWizardSteps(withActivity(activity))).toContain(
                "frontEnsemble",
            );
    });
});

describe("wizardStateToFormState", () => {
    const complete = (activity: string): NewShowWizardState => ({
        ...withActivity(activity),
        project: { projectName: "Show", fileLocation: "/tmp" },
        field: {
            template: FieldPropertiesTemplates.INDOOR_60x90_8to5,
            isCustom: false,
            image: new Uint8Array([1, 2, 3]),
        },
        frontEnsemble: { size: "small" },
    });

    it("drops a pit picked before switching to Winter Guard", () => {
        expect(
            wizardStateToFormState(complete("Winter Guard")).frontEnsemble,
        ).toBeNull();
        expect(
            wizardStateToFormState(complete("Indoor Percussion")).frontEnsemble,
        ).toEqual({ size: "small" });
    });

    it("carries the floor image picked in the Field step", () => {
        expect(
            wizardStateToFormState(complete("Winter Guard")).fieldImage,
        ).toEqual(new Uint8Array([1, 2, 3]));
    });
});
