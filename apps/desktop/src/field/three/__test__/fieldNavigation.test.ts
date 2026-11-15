import { beforeEach, describe, expect, it } from "vitest";
import {
    enterFieldEditView,
    glideTo,
    isGliding,
    leaveFieldEditView,
    setView,
} from "../fieldNavigation";
import { fieldEditMode } from "@/field/editMode/fieldEditModeStore";
import { useFieldViewStore } from "../fieldView";

/** The floating editor's glide to keep a shape in view (#441) */

const START = { width: 1000, height: 600, zoom: 2, panX: 0, panY: 0 };

beforeEach(() => {
    useFieldViewStore.setState({
        ...START,
        baseZoom: 2,
        field: { width: 400, height: 200 },
    });
});

const frame = () => new Promise((r) => requestAnimationFrame(r));

async function settle(id: number | null) {
    for (let i = 0; i < 200 && isGliding(id); i++) await frame();
}

describe("glideTo", () => {
    it("glides to the view asked for", async () => {
        const id = glideTo({ ...START, zoom: 1, panX: 40, panY: -30 });
        expect(isGliding(id)).toBe(true);
        await settle(id);
        expect(isGliding(id)).toBe(false);
        const view = useFieldViewStore.getState();
        expect(view.zoom).toBeCloseTo(1);
        expect(view.panX).toBeCloseTo(40);
        expect(view.panY).toBeCloseTo(-30);
    });

    it("keeps the pane's size when it's resized along the way (review)", async () => {
        const id = glideTo({ ...START, panX: 80 });
        await frame();
        await frame();
        // A splitter or window resize while it glides
        useFieldViewStore.setState({ width: 700, height: 450 });
        await frame();
        await frame();
        expect(useFieldViewStore.getState().width).toBe(700);
        expect(useFieldViewStore.getState().height).toBe(450);
        await settle(id);
        const view = useFieldViewStore.getState();
        expect(view.width).toBe(700);
        expect(view.height).toBe(450);
        expect(view.zoom).toBeCloseTo(2);
        expect(view.panX).toBeCloseTo(80);
    });
});

/** The Edit field mode holds the field still, fitted inside its rulers (#824, owner feedback) */
describe("the Edit field mode's view", () => {
    const settleAll = async () => {
        for (let i = 0; i < 200; i++) await frame();
    };

    it("fits the field inside the rulers, ignores navigation, and goes back on Done", async () => {
        fieldEditMode.enter();
        enterFieldEditView();
        await settleAll();
        const fitted = useFieldViewStore.getState();
        expect(fitted.panX).toBeGreaterThanOrEqual(22);
        expect(fitted.panY).toBeGreaterThanOrEqual(22);
        expect(fitted.panX + 400 * fitted.zoom).toBeLessThanOrEqual(1000);
        expect(fitted.panY + 200 * fitted.zoom).toBeLessThanOrEqual(600);

        // Wheel, drags, pinches and app actions all go through here: none moves the view
        setView({ ...START, zoom: 5, panX: -300, panY: -100 });
        const held = useFieldViewStore.getState();
        expect(held.zoom).toBe(fitted.zoom);
        expect(held.panX).toBe(fitted.panX);

        fieldEditMode.exit();
        leaveFieldEditView();
        await settleAll();
        const back = useFieldViewStore.getState();
        expect(back.zoom).toBeCloseTo(START.zoom);
        expect(back.panX).toBeCloseTo(START.panX);
        expect(back.panY).toBeCloseTo(START.panY);
    });

    it("reads 100% at the view from before when the panel closes (sims: it read 146%)", async () => {
        fieldEditMode.enter();
        enterFieldEditView();
        await settleAll();
        // The pane is narrowed by the panel while it's open
        useFieldViewStore.setState({ width: 700 });
        fieldEditMode.exit();
        leaveFieldEditView();
        await settleAll();
        const back = useFieldViewStore.getState();
        expect(back.baseZoom).toBe(2);
        expect(back.zoom / back.baseZoom).toBeCloseTo(1);
    });
});
