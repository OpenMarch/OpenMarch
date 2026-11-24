import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useInputModeStore } from "@/stores/InputModeStore";
import {
    FIELD_SELECT_TOOL_KEY,
    useFieldSelectToolStore,
} from "@/field/fieldSelectTool";
import FieldDisplayBar from "../FieldDisplayBar";

/** The field's display bar: path overlays, marcher labels, shape outlines, and placeholders. */

const settings = () => useUiSettingsStore.getState().uiSettings;

const open = () =>
    render(
        <TolgeeProvider tolgee={tolgee}>
            <FieldDisplayBar />
        </TolgeeProvider>,
    );

beforeAll(async () => {
    await tolgee.run();
});

beforeEach(() => {
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    setUiSettings({
        ...uiSettings,
        marcherLabels: "auto",
        shapes: "selected",
        nextPaths: false,
        equipmentIcons: "changed",
        equipmentIconPlace: "beside",
    });
});
afterEach(() => {
    cleanup();
    useInputModeStore.setState({ mode: "pointer" });
    useFieldSelectToolStore.getState().setTool("box");
});

describe("FieldDisplayBar", () => {
    it("holds start flag positions, labels and shapes", () => {
        open();
        for (const id of [
            "start-flag-positions",
            "field-display-labels",
            "field-display-shapes",
        ])
            expect(screen.getByTestId(id)).toBeTruthy();
    });

    it("picks Box or Lasso above the display bar, and keeps it on this device", () => {
        open();
        const group = screen.getByRole("group", { name: "Select tool" });
        const box = within(group).getByRole("radio", { name: "Box select" });
        const lasso = within(group).getByRole("radio", {
            name: "Lasso select",
        });
        expect(box.getAttribute("aria-checked")).toBe("true");
        fireEvent.click(lasso);
        expect(useFieldSelectToolStore.getState().tool).toBe("lasso");
        expect(lasso.getAttribute("aria-checked")).toBe("true");
        expect(box.getAttribute("aria-checked")).toBe("false");
        expect(localStorage.getItem(FIELD_SELECT_TOOL_KEY)).toBe("lasso");
        // It stays until Box is picked: one of two, not a toggle
        fireEvent.click(lasso);
        expect(useFieldSelectToolStore.getState().tool).toBe("lasso");
        expect(lasso.getAttribute("aria-checked")).toBe("true");
        fireEvent.click(box);
        expect(useFieldSelectToolStore.getState().tool).toBe("box");
    });

    it("leaves the Select tool to the pill in the touch layout", () => {
        useInputModeStore.setState({ mode: "touch" });
        open();
        expect(screen.queryByTestId("field-select-tool")).toBeNull();
        expect(screen.getByTestId("field-display-bar")).toBeTruthy();
    });

    it("sets the marcher labels", () => {
        open();
        fireEvent.click(screen.getByTestId("field-display-labels"));
        fireEvent.click(screen.getByTestId("field-display-labels-off"));
        expect(settings().marcherLabels).toBe("off");
        // Picking one closes the choices, as the View tab's select did
        expect(screen.queryByTestId("field-display-labels-off")).toBeNull();
        fireEvent.click(screen.getByTestId("field-display-labels"));
        expect(
            screen
                .getByTestId("field-display-labels-off")
                .getAttribute("aria-checked"),
        ).toBe("true");
    });

    it("sets the shape outlines", () => {
        open();
        fireEvent.click(screen.getByTestId("field-display-shapes"));
        fireEvent.click(screen.getByTestId("field-display-shapes-always"));
        expect(settings().shapes).toBe("always");
    });

    it("toggles next paths from the paths popover", () => {
        open();
        fireEvent.click(screen.getByTestId("start-flag-positions"));
        // Its shortcut shows as keycaps beside it
        expect(
            screen.getByTestId("field-display-next-paths").closest("label")
                ?.textContent,
        ).toMatch(/Next paths\s*M/);
        fireEvent.click(screen.getByTestId("field-display-next-paths"));
        expect(settings().nextPaths).toBe(true);
    });

    it("Equipment icons: who, then where, both in one popup that stays open (#992)", () => {
        open();
        fireEvent.click(screen.getByTestId("field-display-equipment"));
        fireEvent.click(screen.getByTestId("field-display-equipment-everyone"));
        expect(settings().equipmentIcons).toBe("everyone");
        fireEvent.click(
            screen.getByTestId("field-display-equipment-place-dot"),
        );
        expect(settings().equipmentIconPlace).toBe("dot");
        expect(
            screen
                .getByTestId("field-display-equipment-place-dot")
                .getAttribute("aria-checked"),
        ).toBe("true");
    });

    it("greys Where out while the icons are off, with its reason, and a press changes nothing (#992)", () => {
        open();
        fireEvent.click(screen.getByTestId("field-display-equipment"));
        fireEvent.click(screen.getByTestId("field-display-equipment-off"));
        const onNumber = screen.getByTestId(
            "field-display-equipment-place-label",
        );
        expect(onNumber.getAttribute("aria-disabled")).toBe("true");
        expect(
            screen
                .getByTestId("field-display-equipment-place-reason")
                .getAttribute("aria-label"),
        ).toBe(
            "Equipment icons are off. Choose Changed only or Everyone to show them.",
        );
        fireEvent.click(onNumber);
        expect(settings().equipmentIconPlace).toBe("beside");
    });
});
