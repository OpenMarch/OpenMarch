import { afterEach, describe, expect, it } from "vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    renderHook,
} from "@testing-library/react";
import { fieldEditMode } from "@/field/editMode/fieldEditModeStore";
import { FIELD_EDIT_PANEL_ID } from "@/field/editMode/fieldEditPanelId";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import SidebarModal from "@/components/sidebar/SidebarModal";
import { useFieldEditPanel } from "../FieldModal";

// The Field panel and the Edit field mode go together (#824): opening one opens the other,
// and closing the panel, or opening another panel in its place, ends the mode
const sidebar = () => useSidebarModalStore.getState();

afterEach(() => {
    cleanup();
    act(() => {
        fieldEditMode.exit();
        sidebar().setOpen(false);
        sidebar().setContent(null, "");
    });
});

describe("the Field panel and the Edit field mode", () => {
    it("entering the mode opens the panel, and leaving it closes the panel", () => {
        renderHook(() => useFieldEditPanel());
        act(() => {
            fieldEditMode.enter();
        });
        expect(sidebar()).toMatchObject({
            isOpen: true,
            contentId: FIELD_EDIT_PANEL_ID,
        });
        act(() => {
            fieldEditMode.exit();
        });
        expect(sidebar().isOpen).toBe(false);
    });

    it("closing the panel ends the mode", () => {
        renderHook(() => useFieldEditPanel());
        act(() => {
            fieldEditMode.enter();
        });
        act(() => {
            sidebar().setOpen(false);
        });
        expect(fieldEditMode.isActive()).toBe(false);
    });

    it("another panel taking its place ends the mode and stays open", () => {
        renderHook(() => useFieldEditPanel());
        act(() => {
            fieldEditMode.enter();
        });
        act(() => {
            sidebar().setContent(<p>Marchers</p>, "marchers");
        });
        expect(fieldEditMode.isActive()).toBe(false);
        expect(sidebar()).toMatchObject({
            isOpen: true,
            contentId: "marchers",
        });
    });
});

describe("Escape in the sidebar panel", () => {
    it("closes another panel", () => {
        act(() => {
            sidebar().setContent(<p>Marchers</p>, "marchers");
            sidebar().setOpen(true);
        });
        render(<SidebarModal />);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(sidebar().isOpen).toBe(false);
    });

    it("leaves the Field panel to the mode, which first drops the pick", () => {
        act(() => {
            sidebar().setContent(<p>Field</p>, FIELD_EDIT_PANEL_ID);
            sidebar().setOpen(true);
        });
        render(<SidebarModal />);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(sidebar().isOpen).toBe(true);
    });
});
