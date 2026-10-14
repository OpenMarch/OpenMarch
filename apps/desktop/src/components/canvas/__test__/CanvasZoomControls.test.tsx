import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import CanvasZoomControls from "../CanvasZoomControls";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";

vi.stubGlobal(
    "ResizeObserver",
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

function fakeCanvas(initialZoom: number) {
    let zoom = initialZoom;
    return {
        width: 800,
        height: 600,
        getZoom: () => zoom,
        getBaseZoom: () => 1,
        zoomToPoint: vi.fn((_p: unknown, z: number) => {
            zoom = z;
        }),
        requestRenderAll: vi.fn(),
        setZoomExternally: (z: number) => {
            zoom = z;
        },
    };
}

describe("CanvasZoomControls slider", () => {
    it("zooms about the canvas centre and stays within the button range", () => {
        const canvas = fakeCanvas(1);
        render(
            <CanvasZoomControls
                canvas={canvas as unknown as OpenMarchCanvas}
            />,
        );
        const thumb = screen.getByRole("slider");
        expect(thumb.getAttribute("aria-valuemin")).toBe(String(Math.log(0.2)));
        expect(thumb.getAttribute("aria-valuemax")).toBe(String(Math.log(25)));

        fireEvent.keyDown(thumb, { key: "End" });
        const [point, zoom] = canvas.zoomToPoint.mock.calls.at(-1)!;
        expect(point).toEqual({ x: 400, y: 300 });
        expect(zoom).toBeCloseTo(25);
        fireEvent.keyDown(thumb, { key: "Home" });
        expect(canvas.zoomToPoint.mock.calls.at(-1)?.[1]).toBeCloseTo(0.2);
    });

    it("follows zoom changes made elsewhere", async () => {
        vi.useFakeTimers();
        const canvas = fakeCanvas(1);
        render(
            <CanvasZoomControls
                canvas={canvas as unknown as OpenMarchCanvas}
            />,
        );
        canvas.setZoomExternally(5);
        await act(async () => {
            vi.advanceTimersByTime(150);
        });
        expect(
            Number(screen.getByRole("slider").getAttribute("aria-valuenow")),
        ).toBeCloseTo(Math.log(5));
        vi.useRealTimers();
    });
});
