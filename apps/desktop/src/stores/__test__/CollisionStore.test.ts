// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type Page from "@/global/classes/Page";
import type { CollisionData } from "@/global/classes/CollisionDetection";
import { useCollisionStore } from "../CollisionStore";

const page = (id: number) => ({ id }) as Page;
const pair = (a: number, b: number): CollisionData => ({
    marcher1Id: a,
    marcher2Id: b,
    label: `${a}, ${b}`,
    x: 0,
    y: 0,
    distance: 0,
});
const current = () => useCollisionStore.getState().currentCollisions;

describe("useCollisionStore", () => {
    beforeEach(() =>
        useCollisionStore.setState({
            collisions: new Map(),
            version: -1,
            currentCollisions: [],
        }),
    );

    it("keeps each page's answer at a version, and shows it on going back", () => {
        const { setCollisions, setCurrentCollision } =
            useCollisionStore.getState();
        setCollisions(page(1), [pair(1, 2)], 5);
        setCollisions(page(2), [pair(3, 4)], 5);
        expect(current()).toEqual([pair(3, 4)]);

        setCurrentCollision(page(1));
        expect(current()).toEqual([pair(1, 2)]);
    });

    it("keeps showing the last answer until the new page's comes in", () => {
        const { setCollisions, setCurrentCollision } =
            useCollisionStore.getState();
        setCollisions(page(1), [pair(1, 2)], 5);
        setCurrentCollision(page(2));
        expect(current()).toEqual([pair(1, 2)]);

        setCollisions(page(2), [], 5);
        expect(current()).toEqual([]);
    });

    it("drops other pages' answers at a new version", () => {
        const { setCollisions, setCurrentCollision } =
            useCollisionStore.getState();
        setCollisions(page(1), [pair(1, 2)], 5);
        setCollisions(page(2), [], 6);
        setCurrentCollision(page(1));
        // Page 1's answer was for version 5: the last one shown stays until detection answers
        expect(current()).toEqual([]);
        expect(useCollisionStore.getState().collisions.has(1)).toBe(false);
    });

    it("shows none without a selected page", () => {
        const { setCollisions, setCurrentCollision } =
            useCollisionStore.getState();
        setCollisions(page(1), [pair(1, 2)], 5);
        setCurrentCollision(null);
        expect(current()).toEqual([]);
    });
});
