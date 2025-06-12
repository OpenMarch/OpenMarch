import { describe, it, expect } from "vitest";
import { classifyShape, type ShapeType } from "./shapeClassifier";
import type { MarcherCoord } from "./index";

describe("classifyShape", () => {
    it("should classify a line of marchers", () => {
        const marchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
            { id: 2, coordinate: { x: 1, y: 0.1 } },
            { id: 3, coordinate: { x: 2, y: 0.2 } },
            { id: 4, coordinate: { x: 3, y: 0.3 } },
        ];

        const shape = classifyShape(marchers);
        expect(shape).toBe("line");
    });

    it("should classify a circle of marchers", () => {
        const marchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 1, y: 0 } },
            { id: 2, coordinate: { x: 0, y: 1 } },
            { id: 3, coordinate: { x: -1, y: 0 } },
            { id: 4, coordinate: { x: 0, y: -1 } },
        ];

        const shape = classifyShape(marchers);
        expect(shape).toBe("circle");
    });

    it("should classify a block of marchers", () => {
        const marchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
            { id: 2, coordinate: { x: 1, y: 0 } },
            { id: 3, coordinate: { x: 0, y: 1 } },
            { id: 4, coordinate: { x: 1, y: 1 } },
        ];

        const shape = classifyShape(marchers);
        expect(shape).toBe("block");
    });

    it("should classify irregular arrangements", () => {
        const marchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
            { id: 2, coordinate: { x: 2, y: 1 } },
            { id: 3, coordinate: { x: -1, y: 3 } },
        ];

        const shape = classifyShape(marchers);
        expect(shape).toBe("irregular");
    });

    it("should classify groups with less than 3 marchers as irregular", () => {
        const marchers: MarcherCoord[] = [
            { id: 1, coordinate: { x: 0, y: 0 } },
            { id: 2, coordinate: { x: 1, y: 1 } },
        ];

        const shape = classifyShape(marchers);
        expect(shape).toBe("irregular");
    });
});
