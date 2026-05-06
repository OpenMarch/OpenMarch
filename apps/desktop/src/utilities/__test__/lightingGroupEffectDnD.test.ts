import { describe, expect, it } from "vitest";
import {
    getLightingGroupMarcherCollectionDragPayload,
    partitionLightingGroupDropMarcherIds,
    setLightingGroupMarcherCollectionDragData,
    shouldCancelLightingGroupDragStart,
} from "../lightingGroupEffectDnD";

describe("shouldCancelLightingGroupDragStart", () => {
    it("returns false for plain div target", () => {
        const div = document.createElement("div");
        expect(shouldCancelLightingGroupDragStart(div)).toBe(false);
    });

    it("returns true when target is a button", () => {
        const button = document.createElement("button");
        expect(shouldCancelLightingGroupDragStart(button)).toBe(true);
    });

    it("returns true when target is inside a button", () => {
        const button = document.createElement("button");
        const span = document.createElement("span");
        button.appendChild(span);
        expect(shouldCancelLightingGroupDragStart(span)).toBe(true);
    });

    it("returns true for input", () => {
        const input = document.createElement("input");
        expect(shouldCancelLightingGroupDragStart(input)).toBe(true);
    });

    it("returns true for role=button", () => {
        const el = document.createElement("div");
        el.setAttribute("role", "button");
        expect(shouldCancelLightingGroupDragStart(el)).toBe(true);
    });
});

describe("lighting group marcher collection drag payload", () => {
    it("encodes and decodes payload with unique marcher ids", () => {
        const dataByType = new Map<string, string>();
        const dataTransfer = {
            effectAllowed: "none",
            dropEffect: "none",
            files: [] as unknown as FileList,
            items: [] as unknown as DataTransferItemList,
            get types() {
                return [...dataByType.keys()];
            },
            setData: (format: string, data: string) => {
                dataByType.set(format, data);
            },
            getData: (format: string) => dataByType.get(format) ?? "",
            clearData: () => dataByType.clear(),
            setDragImage: () => undefined,
        } as unknown as DataTransfer;
        setLightingGroupMarcherCollectionDragData(dataTransfer, {
            sourceType: "selection",
            label: "Current Selection (3)",
            marcherIds: [1, 2, 2, 3],
        });

        expect(
            getLightingGroupMarcherCollectionDragPayload(dataTransfer),
        ).toEqual({
            sourceType: "selection",
            label: "Current Selection (3)",
            marcherIds: [1, 2, 3],
        });
    });
});

describe("partitionLightingGroupDropMarcherIds", () => {
    it("partitions ids into already assigned, other group, and unassigned", () => {
        const memberships = new Map<number, Set<number>>([
            [1, new Set([1, 2])],
            [2, new Set([4])],
        ]);

        expect(
            partitionLightingGroupDropMarcherIds({
                draggedMarcherIds: [1, 3, 4, 4],
                targetGroupId: 1,
                membershipsByGroupId: memberships,
            }),
        ).toEqual({
            alreadyInTarget: [1],
            inOtherGroups: [4],
            unassigned: [3],
        });
    });

    it("returns empty sets when dragged ids are empty", () => {
        expect(
            partitionLightingGroupDropMarcherIds({
                draggedMarcherIds: [],
                targetGroupId: 1,
                membershipsByGroupId: new Map(),
            }),
        ).toEqual({
            alreadyInTarget: [],
            inOtherGroups: [],
            unassigned: [],
        });
    });
});
