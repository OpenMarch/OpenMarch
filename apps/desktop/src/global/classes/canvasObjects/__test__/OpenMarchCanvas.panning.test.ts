import { afterEach, describe, expect, it } from "vitest";
import OpenMarchCanvas from "../OpenMarchCanvas";
import FieldPropertiesTemplates from "../../FieldProperties.templates";
import { defaultSettings } from "@/stores/UiSettingsStore";

const createMountedCanvas = () => {
    const container = document.createElement("div");
    const canvasEl = document.createElement("canvas");
    container.appendChild(canvasEl);
    document.body.appendChild(container);
    const canvas = new OpenMarchCanvas({
        canvasRef: canvasEl,
        fieldProperties:
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
        uiSettings: defaultSettings,
    });
    const wrapper = container.querySelector(
        ".canvas-zoom-wrapper",
    ) as HTMLDivElement;
    return { canvas, wrapper };
};

const pressMouse = (wrapper: HTMLElement, init: MouseEventInit = {}) =>
    wrapper.dispatchEvent(new MouseEvent("mousedown", init));

describe("OpenMarchCanvas Alt panning", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("starts a pan on mousedown while Alt is held", () => {
        const { wrapper } = createMountedCanvas();
        document.dispatchEvent(new KeyboardEvent("keydown", { altKey: true }));
        pressMouse(wrapper, { altKey: true });
        expect(wrapper.style.cursor).toBe("grabbing");
    });

    it("does not pan on a plain click after Alt was released in another window", () => {
        const { wrapper } = createMountedCanvas();
        // Alt-Tab: the keydown reaches the app, the keyup goes to the other window
        document.dispatchEvent(new KeyboardEvent("keydown", { altKey: true }));
        window.dispatchEvent(new Event("blur"));
        pressMouse(wrapper);
        expect(wrapper.style.cursor).not.toBe("grabbing");
    });

    it("drops the Alt grab cursor when the window loses focus", () => {
        const { wrapper } = createMountedCanvas();
        document.dispatchEvent(new KeyboardEvent("keydown", { altKey: true }));
        expect(wrapper.style.cursor).toBe("grab");
        window.dispatchEvent(new Event("blur"));
        expect(wrapper.style.cursor).toBe("default");
    });

    it("ends an Alt pan when the window loses focus mid-drag", () => {
        const { wrapper } = createMountedCanvas();
        document.dispatchEvent(new KeyboardEvent("keydown", { altKey: true }));
        pressMouse(wrapper, { altKey: true });
        // The mouseup lands in the other window
        window.dispatchEvent(new Event("blur"));
        expect(wrapper.style.cursor).toBe("default");
    });
});
