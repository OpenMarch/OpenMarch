import { describe, expect, it } from "vitest";
import {
    clearLightingGroupMarcherCollectionDragData,
    getLightingGroupMarcherCollectionDragPayload,
    groupMarcherIdsForRemovalByGroup,
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

    it("falls back to active payload when getData is empty on drop", () => {
        clearLightingGroupMarcherCollectionDragData();
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
            getData: () => "",
            clearData: () => dataByType.clear(),
            setDragImage: () => undefined,
        } as unknown as DataTransfer;

        setLightingGroupMarcherCollectionDragData(dataTransfer, {
            sourceType: "section",
            label: "Brass",
            marcherIds: [10, 11],
        });

        expect(
            getLightingGroupMarcherCollectionDragPayload(dataTransfer),
        ).toEqual({
            sourceType: "section",
            label: "Brass",
            marcherIds: [10, 11],
        });

        clearLightingGroupMarcherCollectionDragData();
        expect(
            getLightingGroupMarcherCollectionDragPayload(dataTransfer),
        ).toBeUndefined();
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

describe("groupMarcherIdsForRemovalByGroup", () => {
    const memberships = new Map<number, Set<number>>([
        [1, new Set([1, 2])],
        [2, new Set([4, 5])],
    ]);

    it("returns empty map when dragged ids are empty", () => {
        expect(
            groupMarcherIdsForRemovalByGroup({
                marcherIds: [],
                membershipsByGroupId: memberships,
            }),
        ).toEqual(new Map());
    });

    it("returns empty map when dragged marchers are not in any group", () => {
        expect(
            groupMarcherIdsForRemovalByGroup({
                marcherIds: [3, 6],
                membershipsByGroupId: memberships,
            }),
        ).toEqual(new Map());
    });

    it("groups marchers by their current group membership", () => {
        expect(
            groupMarcherIdsForRemovalByGroup({
                marcherIds: [1, 3, 4, 4],
                membershipsByGroupId: memberships,
            }),
        ).toEqual(
            new Map([
                [1, [1]],
                [2, [4]],
            ]),
        );
    });

    it("dedupes dragged ids before matching", () => {
        expect(
            groupMarcherIdsForRemovalByGroup({
                marcherIds: [2, 2, 5],
                membershipsByGroupId: memberships,
            }),
        ).toEqual(
            new Map([
                [1, [2]],
                [2, [5]],
            ]),
        );
    });
});
