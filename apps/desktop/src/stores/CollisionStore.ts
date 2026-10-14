import getPageCollisions, {
    CollisionData,
    getCollisionsForSelectedPage,
} from "@/global/classes/CollisionDetection";
import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import { MarcherTimeline } from "@/utilities/Keyframes";
import { create } from "zustand";

type CollisionStoreInterface = {
    collisions: Map<number, CollisionData[]>;
    currentCollisions: CollisionData[];
    setCollisions: (
        marchers: Marcher[],
        marcherTimelines: Map<number, MarcherTimeline>,
        pages: Page[],
    ) => void;

    setCurrentCollision: (selectedPage: Page | null) => void;
};

export const useCollisionStore = create<CollisionStoreInterface>((set) => ({
    collisions: new Map<number, CollisionData[]>(),
    currentCollisions: [],
    setCollisions: (
        marchers: Marcher[],
        marcherTimelines: Map<number, MarcherTimeline>,
        pages: Page[],
    ) =>
        set(() => ({
            collisions: getPageCollisions(marchers, marcherTimelines, pages),
        })),
    setCurrentCollision: (selectedPage: Page | null) =>
        set((state) => ({
            currentCollisions: getCollisionsForSelectedPage(
                selectedPage,
                state.collisions,
            ),
        })),
}));
