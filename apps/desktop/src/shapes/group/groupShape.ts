import tolgee from "@/global/singletons/Tolgee";
import { fieldToFrame, frameCorners } from "../frame/frame";
import type { ShapeKind } from "../types";
import {
    groupAt,
    groupFrame,
    groupSpots,
    type GroupParams,
} from "./groupGeometry";

/**
 * The group's shape kind, as recipes store it (#603): `group`, version 1. Its params are its
 * frame (center, turn, flips) and each spot in the frame's own axes (`points`); its spots are
 * those, in slot order.
 */
export const groupShape: ShapeKind<GroupParams> = {
    id: "group",
    version: 1,
    get label() {
        return tolgee.t("shapes.kinds.group.label", "Group");
    },
    family: "fill",
    defaultOrder: "nearest",
    groups: [],
    fit: ({ current }) => groupAt(current),
    // A group has no handles of its own (`groupTool.ts`)
    handles: () => [],
    drag: (p) => p,
    outline: (p) => {
        const corners = frameCorners(groupFrame(p));
        return [[...corners, corners[0]!]];
    },
    generate: (p, n) => groupSpots(p).slice(0, n),
    /** Back to front, then left to right, in the group's own axes */
    orderKey(p, point) {
        const local = fieldToFrame(groupFrame(p), point);
        return [p.flipY ? -local.y : local.y, p.flipX ? -local.x : local.x];
    },
};
