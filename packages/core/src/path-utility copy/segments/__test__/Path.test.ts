import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Path } from "../../Path";
import { Line } from "../Line";

const randomFloat = () =>
    fc.float({ noNaN: true, noDefaultInfinity: true, noInteger: false });
const point = fc.record({
    x: randomFloat(),
    y: randomFloat(),
});
describe("Path", () => {
    describe("single segment", () => {
        it("create path", () => {
            fc.assert(
                fc.property(fc.array(point, { minLength: 2 }), (points) => {
                    const path = new Path({ x: 0, y: 0 }, [new Line(points)]);
                    expect(path.segments.length).toBe(1);
                    expect(path.segments[0]!.controlPoints).toMatchObject(
                        points,
                    );
                }),
            );
        });
    });
});
