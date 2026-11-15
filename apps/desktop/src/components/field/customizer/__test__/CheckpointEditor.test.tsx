import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Form from "@radix-ui/react-form";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { runFieldEdit } from "@/field/edits";
import { CheckpointEditor, type UpdateCheckpoint } from "../CheckpointEditor";

const college = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const fortyFive = college.xCheckpoints.find(
    (c) => c.stepsFromCenterFront === -8,
)!;

/** Runs the customizer's move as the edit it is, and resolves with its result */
const moveLikeTheCustomizer: UpdateCheckpoint = async ({ newCheckpoint }) =>
    runFieldEdit(college, {
        edit: "moveCheckpoints",
        args: {
            ids: [{ axis: "x", id: fortyFive.id }],
            to: newCheckpoint.stepsFromCenterFront,
            followNames: false,
        },
    });

function typeSteps(value: string) {
    fireEvent.click(screen.getByRole("button", { name: /45 yard line/ }));
    const input = screen.getByDisplayValue("-8");
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    return input as HTMLInputElement;
}

const renderEditor = () =>
    render(
        <Form.Root>
            <CheckpointEditor
                checkpoint={fortyFive}
                axis="x"
                updateCheckpoint={moveLikeTheCustomizer}
                deleteCheckpoint={vi.fn()}
            />
        </Form.Root>,
    );

describe("CheckpointEditor", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            },
        );
    });
    afterEach(() => vi.unstubAllGlobals());

    it("shows the stored, rounded position after a move (-10.126 → -10.13)", async () => {
        renderEditor();
        const input = typeSteps("-10.126");
        await waitFor(() => expect(input.value).toBe("-10.13"));
    });

    it("puts the stored position back after a refused move", async () => {
        renderEditor();
        // The 40 yard line is at -16
        const input = typeSteps("-16");
        await waitFor(() => expect(input.value).toBe("-8"));
    });
});
