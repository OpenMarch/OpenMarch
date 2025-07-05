import { describe, it, expect, beforeEach } from "vitest";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { ReactNode } from "react";

describe("useSidebarModalStore", () => {
    beforeEach(() => {
        useSidebarModalStore.setState({
            isOpen: false,
            content: (
                <h4 className="text-h4 text-red">
                    Sidebar modal content failed to render
                </h4>
            ),
        });
    });

    it("should have correct initial state", () => {
        const { isOpen, content } = useSidebarModalStore.getState();

        expect(isOpen).toBe(false);
        expect(content).toEqual(
            <h4 className="text-h4 text-red">
                Sidebar modal content failed to render
            </h4>,
        );
    });

    it("should toggle isOpen state", () => {
        const { toggleOpen, isOpen } = useSidebarModalStore.getState();

        expect(isOpen).toBe(false);

        toggleOpen();
        expect(useSidebarModalStore.getState().isOpen).toBe(true);

        toggleOpen();
        expect(useSidebarModalStore.getState().isOpen).toBe(false);
    });

    it("should set isOpen state", () => {
        const { setOpen, isOpen } = useSidebarModalStore.getState();

        expect(isOpen).toBe(false);

        setOpen(true);
        expect(useSidebarModalStore.getState().isOpen).toBe(true);

        setOpen(false);
        expect(useSidebarModalStore.getState().isOpen).toBe(false);
    });

    it("should set content", () => {
        const { setContent, content } = useSidebarModalStore.getState();

        expect(content).toEqual(
            <h4 className="text-h4 text-red">
                Sidebar modal content failed to render
            </h4>,
        );

        const newContent: ReactNode = <div>New Sidebar Content</div>;

        setContent(newContent, "new-content");

        expect(useSidebarModalStore.getState().content).toEqual(newContent);
    });
});
