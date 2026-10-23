import { fabric } from "fabric";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";

const formatSteps = (steps: number) => {
    const rounded = Math.round(Math.abs(steps) * 4) / 4;
    const text = Number.isInteger(rounded)
        ? String(rounded)
        : rounded.toFixed(2).replace(/0$/, "");
    return { text, one: rounded === 1 };
};

/**
 * Words for how far a drag has moved marchers, e.g.
 * "4 steps to S2 · 2 steps toward the front". The front of the field is at
 * the bottom of the view.
 *
 * @param dxSteps Steps to the right (negative: left)
 * @param dySteps Steps down the view, toward the front (negative: toward the back)
 */
export function describeStepDelta(
    dxSteps: number,
    dySteps: number,
    sides: { terseLeft: string; terseRight: string },
): string {
    const x = formatSteps(dxSteps);
    const y = formatSteps(dySteps);
    const unit = (f: { one: boolean }) => (f.one ? "step" : "steps");
    const side =
        x.text === "0"
            ? "0 steps side to side"
            : `${x.text} ${unit(x)} to ${dxSteps > 0 ? sides.terseRight : sides.terseLeft}`;
    const frontBack =
        y.text === "0"
            ? "0 steps front to back"
            : `${y.text} ${unit(y)} toward the ${dySteps > 0 ? "front" : "back"}`;
    return `${side} · ${frontBack}`;
}

type MovingEvent = fabric.IEvent<MouseEvent> & {
    transform?: {
        action?: string;
        original?: { left?: number; top?: number };
    };
};

const movesMarchers = (target: fabric.Object | undefined) =>
    target instanceof CanvasMarcher ||
    (target instanceof fabric.Group &&
        target.getObjects().some((o) => o instanceof CanvasMarcher));

/**
 * While marchers are dragged, shows how many steps they have moved next to
 * the finger or pointer, so a move of exactly N steps can be made by hand.
 */
export class DragStepReadout {
    private element: HTMLDivElement | null = null;

    constructor(
        private readonly canvas: OpenMarchCanvas,
        private readonly wrapper: HTMLElement,
    ) {}

    attach() {
        this.canvas.on("object:moving", this.onMoving as any);
        this.canvas.on("mouse:up", this.hide);
        this.canvas.on("object:modified", this.hide);
        this.canvas.on("selection:cleared", this.hide);
    }

    detach() {
        this.canvas.off("object:moving", this.onMoving as any);
        this.canvas.off("mouse:up", this.hide);
        this.canvas.off("object:modified", this.hide);
        this.canvas.off("selection:cleared", this.hide);
        this.hide();
    }

    private onMoving = (event: MovingEvent) => {
        const e = event.e as PointerEvent | undefined;
        const transform = event.transform;
        const target = event.target;
        const original = transform?.original;
        if (
            !e ||
            !Number.isFinite(e.clientX) ||
            transform?.action !== "drag" ||
            !original ||
            !movesMarchers(target)
        ) {
            this.hide();
            return;
        }
        const pixelsPerStep = this.canvas.fieldProperties.pixelsPerStep;
        if (!(pixelsPerStep > 0)) return;
        const dx = ((target!.left ?? 0) - (original.left ?? 0)) / pixelsPerStep;
        const dy = ((target!.top ?? 0) - (original.top ?? 0)) / pixelsPerStep;
        const text = describeStepDelta(
            dx,
            dy,
            this.canvas.fieldProperties.sideDescriptions,
        );
        const el = this.ensureElement();
        el.textContent = text;
        const rect = this.wrapper.getBoundingClientRect();
        // Above a finger, clear of the fingertip; closer to a mouse pointer
        const above = e.pointerType === "touch" ? 64 : 28;
        const left = Math.min(
            Math.max(8, e.clientX - rect.left - el.offsetWidth / 2),
            Math.max(8, rect.width - el.offsetWidth - 8),
        );
        const top = Math.max(8, e.clientY - rect.top - above - el.offsetHeight);
        el.style.transform = `translate(${left}px, ${top}px)`;
        el.style.visibility = "visible";
    };

    private ensureElement() {
        if (this.element) return this.element;
        const el = document.createElement("div");
        el.setAttribute("role", "status");
        el.setAttribute("aria-live", "polite");
        el.dataset.testid = "drag-step-readout";
        el.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            z-index: 6;
            pointer-events: none;
            white-space: nowrap;
            padding: 4px 8px;
            border-radius: 6px;
            font: 500 13px/1.3 system-ui, sans-serif;
            color: white;
            background: rgba(20, 20, 24, 0.85);
            visibility: hidden;
        `;
        this.wrapper.appendChild(el);
        this.element = el;
        return el;
    }

    hide = () => {
        if (this.element) this.element.style.visibility = "hidden";
    };
}
