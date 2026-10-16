import { CollisionData } from "@/global/classes/CollisionDetection";
import Page from "@/global/classes/Page";
import { isPlaywrightSession } from "@/utilities/playwrightSession";
import { create } from "zustand";

type CollisionStoreInterface = {
    /**
     * The collisions found at `version`, by the id of the page they were found for
     * (`useCollisionDetection`)
     */
    collisions: Map<number, CollisionData[]>;
    /** The resolver version `collisions` were found at */
    version: number;
    currentCollisions: CollisionData[];
    /**
     * The collisions found for a page at a resolver version; the page is the selected one when
     * they were asked for. A new version drops the other pages' answers.
     */
    setCollisions: (
        page: Pick<Page, "id">,
        collisions: CollisionData[],
        version: number,
    ) => void;

    /**
     * Shows the selected page's collisions, when they are known at the current version. When they
     * aren't, keeps showing the last ones until detection answers, so the Collisions tab doesn't
     * blink away (and close) on every page change.
     */
    setCurrentCollision: (selectedPage: Page | null) => void;
};

/** Set when a scenario puts collisions on the page; detection then leaves them be. */
let seeded = false;

export const useCollisionStore = create<CollisionStoreInterface>((set) => ({
    collisions: new Map<number, CollisionData[]>(),
    version: -1,
    currentCollisions: [],
    setCollisions: (page, collisions, version) => {
        if (seeded) return;
        set((state) => {
            const byPage =
                state.version === version
                    ? new Map(state.collisions)
                    : new Map<number, CollisionData[]>();
            byPage.set(page.id, collisions);
            return {
                collisions: byPage,
                version,
                currentCollisions: collisions,
            };
        });
    },
    setCurrentCollision: (selectedPage: Page | null) => {
        if (seeded) return;
        set((state) => {
            if (!selectedPage) return { currentCollisions: [] };
            const known = state.collisions.get(selectedPage.id);
            return known ? { currentCollisions: known } : {};
        });
    },
}));

declare global {
    interface Window {
        /** Scenario setup, in Playwright sessions only; see below. */
        openmarchCollisions?: {
            show(collisions: CollisionData[]): void;
        };
    }
}

/**
 * Scenario setup (fork #201): puts made-up collisions on the page, for the
 * parity scenarios and render comparisons of collision markers and "Zoom to
 * collisions" that need them at a known spot. Detection
 * (`useCollisionDetection`) then stops replacing them until reload. Only in
 * Playwright sessions; the scenarios still read the field only through the
 * field test API.
 */
if (typeof window !== "undefined" && isPlaywrightSession())
    window.openmarchCollisions = {
        show: (collisions) => {
            seeded = true;
            useCollisionStore.setState({ currentCollisions: collisions });
        },
    };
