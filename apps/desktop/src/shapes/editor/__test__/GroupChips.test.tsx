import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { lineTool } from "../../line/lineTool";
import { drawLine, type LineParams } from "../../line/lineGeometry";
import type { ToolEnv } from "../../tool/toolKind";
import { chipLayout } from "../chip";
import { GroupChips } from "../GroupChips";
import { stubPointerCapture } from "./pointerEvents";

/**
 * A Line's group chips in the floating editor (#526): a chip per group (`2 × 3 │ 4 × 2`), each
 * count and interval typed or dragged, + adding a group and × removing one, a grown group marked.
 * Driven on the real Line kind, the shape kept as the editor would keep it.
 */

const STEP = 10;
const half = STEP / 2;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({
        x: Math.round(p.x / half) * half,
        y: Math.round(p.y / half) * half,
    }),
    hitRadius: 3,
};
const interval = lineTool.params.find((p) => p.key === "interval")!;

/** `n` marchers on a line typed with `list` */
const lineWith = (n: number, list: string) =>
    interval.type(
        drawLine({ x: 100, y: 100 }, { x: 150, y: 100 }, env)!,
        n,
        list,
        env,
    ) as LineParams;

/** The chips over a shape the test can read back, as the editor holds it */
function Editor({ start, n }: { start: LineParams; n: number }) {
    const [params, setParams] = useState<unknown>(start);
    const before = useRef<unknown>(start);
    const groups = chipLayout(lineTool, params, n, env).groups;
    return (
        <>
            <output data-testid="list">
                {JSON.stringify((params as LineParams).spacing)}
            </output>
            {groups && (
                <GroupChips
                    target={{
                        kind: lineTool,
                        params,
                        spots: n,
                        apply: setParams,
                        begin: () => {
                            before.current = params;
                        },
                        preview: setParams,
                        end: (keep) => {
                            if (!keep) setParams(before.current);
                        },
                    }}
                    groups={groups}
                    envFor={() => env}
                />
            )}
        </>
    );
}

const chipsText = () =>
    screen.queryByTestId("shape-groups")?.textContent?.replace(/\s+/g, " ");

/** Opens a number for typing, as a keyboard or screen reader does, and types `text` */
function typeInto(testId: string, text: string) {
    fireEvent.click(screen.getByTestId(testId), { detail: 0 });
    const input = screen.getByTestId(`${testId}-input`);
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: "Enter" });
}

let restorePointerCapture: () => void;
beforeEach(() => {
    restorePointerCapture = stubPointerCapture();
});
afterEach(() => {
    cleanup();
    restorePointerCapture();
});

describe("a line's group chips", () => {
    it("shows each group as count × interval, divided", () => {
        render(<Editor start={lineWith(6, "2*3+4*2")} n={6} />);
        expect(chipsText()).toBe("2×3│4×2");
        expect(screen.getByTestId("shape-group-0-count")).toHaveTextContent(
            "2",
        );
        expect(screen.getByTestId("shape-group-1-interval")).toHaveTextContent(
            "2",
        );
    });

    it("marks a grown group and the rest", () => {
        render(<Editor start={lineWith(10, "2*3+4*2")} n={10} />);
        expect(screen.getByTestId("shape-group-1-grown")).toHaveTextContent(
            "+4",
        );
        expect(screen.getByTestId("shape-group-1")).toHaveAttribute(
            "data-grown",
            "4",
        );
        cleanup();
        render(<Editor start={lineWith(10, "2.5+3*4")} n={10} />);
        expect(screen.getByTestId("shape-group-0")).toHaveAttribute(
            "data-rest",
            "true",
        );
        expect(screen.getByTestId("shape-group-0-count")).toHaveTextContent(
            "7",
        );
    });

    it("types a count and an interval", () => {
        render(<Editor start={lineWith(6, "2*3+4*2")} n={6} />);
        typeInto("shape-group-0-count", "3");
        expect(chipsText()).toBe("3×3│3×2");
        typeInto("shape-group-1-interval", "2½");
        expect(chipsText()).toBe("3×3│3×2½");
    });

    it("takes the full syntax typed into a number", () => {
        render(<Editor start={lineWith(6, "2*3+4*2")} n={6} />);
        typeInto("shape-group-0-interval", "1*4+2*2+3");
        expect(chipsText()).toBe("1×4│2×2│3×3");
    });

    it("keeps a count it can't read open to fix", () => {
        render(<Editor start={lineWith(6, "2*3+4*2")} n={6} />);
        typeInto("shape-group-0-count", "1.5");
        expect(
            screen.getByTestId("shape-group-0-count-input"),
        ).toBeInTheDocument();
    });

    it("drags a count", () => {
        render(<Editor start={lineWith(6, "2*3+4*2")} n={6} />);
        const count = screen.getByTestId("shape-group-0-count");
        fireEvent.pointerDown(count, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(count, { clientX: 33, clientY: 0 });
        fireEvent.pointerUp(count, { clientX: 33, clientY: 0 });
        expect(chipsText()).toBe("4×3│2×2");
    });

    it("adds a group with + and removes one with ×", () => {
        render(<Editor start={lineWith(6, "2*3+4*2")} n={6} />);
        fireEvent.click(screen.getByLabelText("Add a group"));
        expect(chipsText()).toBe("2×3│3×2│1×2");
        fireEvent.click(screen.getByLabelText("Remove group 2"));
        // The last group grows into the marchers the removed one had
        expect(chipsText()).toBe("2×3│4+3×2");
        // One group left is everyone at its interval: the single number shows again
        fireEvent.click(screen.getByLabelText("Remove group 1"));
        expect(screen.queryByTestId("shape-groups")).toBeNull();
        expect(screen.getByTestId("list")).toHaveTextContent(
            // Unlocked, as typing leaves it
            JSON.stringify({ mode: "fit", groups: [{ interval: 20 }] }),
        );
    });
});
