import { describe, expect, it } from "vitest";
import {
    getLightingGroupMarcherCollectionDragPayload,
    partitionLightingGroupDropMarcherIds,
    setLightingGroupMarcherCollectionDragData,
} from "../lightingGroupEffectDnD";

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
