import { describe, expect, it } from "vitest";
import { fabric } from "fabric";
import OpenMarchCanvas from "../OpenMarchCanvas";

/**
 * `bringObjectsToFront` raises many objects in one pass; it must leave the same stacking order as
 * calling Fabric's `bringToFront` on each in turn, which the marcher renders used to do.
 */
describe("OpenMarchCanvas.bringObjectsToFront", () => {
    const fakeCanvas = () => {
        const canvas = {
            _objects: [] as fabric.Object[],
            renderOnAddRemove: false,
        };
        const object = (name: string, onCanvas = true) =>
            ({
                name,
                canvas: onCanvas ? canvas : undefined,
            }) as unknown as fabric.Object;
        return { canvas, object };
    };
    const names = (objects: readonly fabric.Object[]) =>
        objects.map((o) => (o as unknown as { name: string }).name);
    const raise = (canvas: object, objects: fabric.Object[]) =>
        OpenMarchCanvas.prototype.bringObjectsToFront.call(
            canvas as OpenMarchCanvas,
            objects,
        );

    it("matches raising each object in turn", () => {
        const { canvas, object } = fakeCanvas();
        const [grid, m1, label1, path, m2, label2, m3] = [
            "grid",
            "m1",
            "label1",
            "path",
            "m2",
            "label2",
            "m3",
        ].map((n) => object(n));
        canvas._objects = [grid, m1, label1, path, m2, label2, m3];

        const expected = [...canvas._objects];
        for (const raised of [m3, m1, m2]) {
            expected.splice(expected.indexOf(raised), 1);
            expected.push(raised);
        }
        raise(canvas, [m3, m1, m2]);
        expect(names(canvas._objects)).toEqual(names(expected));
        expect(names(canvas._objects)).toEqual([
            "grid",
            "label1",
            "path",
            "label2",
            "m3",
            "m1",
            "m2",
        ]);
    });

    it("leaves out objects that aren't on the canvas", () => {
        const { canvas, object } = fakeCanvas();
        const a = object("a");
        const b = object("b");
        const elsewhere = object("elsewhere", false);
        const removed = object("removed");
        canvas._objects = [a, b];
        raise(canvas, [a, elsewhere, removed]);
        expect(names(canvas._objects)).toEqual(["b", "a"]);
    });
});
