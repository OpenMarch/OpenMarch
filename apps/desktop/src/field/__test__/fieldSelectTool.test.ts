import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useInputModeStore } from "@/stores/InputModeStore";
import {
    areaKindOf,
    parseFieldSelectTool,
    useFieldAreaTool,
    useFieldSelectToolStore,
} from "../fieldSelectTool";

/** The field's Select tool: Box or Lasso for a mouse drag from empty field. */

afterEach(() => {
    useInputModeStore.setState({ mode: "pointer" });
    useFieldSelectToolStore.getState().setTool("box");
});

describe("fieldSelectTool", () => {
    it("reads anything but a stored lasso as Box", () => {
        expect(parseFieldSelectTool("lasso")).toBe("lasso");
        expect(parseFieldSelectTool("box")).toBe("box");
        expect(parseFieldSelectTool(null)).toBe("box");
        expect(parseFieldSelectTool("pan")).toBe("box");
    });

    it("toggles between Box and Lasso, as the shortcut does", () => {
        const { toggle } = useFieldSelectToolStore.getState();
        toggle();
        expect(useFieldSelectToolStore.getState().tool).toBe("lasso");
        toggle();
        expect(useFieldSelectToolStore.getState().tool).toBe("box");
    });

    it("names the editor's area for each tool", () => {
        expect(areaKindOf("box")).toBe("marquee");
        expect(areaKindOf("lasso")).toBe("lasso");
    });

    it("hands the editor the tool, except in the touch layout, where the pill decides", () => {
        useFieldSelectToolStore.getState().setTool("lasso");
        const { result, rerender } = renderHook(() => useFieldAreaTool());
        expect(result.current).toBe("lasso");
        useInputModeStore.setState({ mode: "touch" });
        rerender();
        expect(result.current).toBe("marquee");
    });
});
