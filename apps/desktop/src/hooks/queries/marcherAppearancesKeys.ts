const KEY_BASE = "marcher-appearances";

/**
 * Query keys for the canvas marcher appearances (`useMarcherAppearances.ts`). A leaf module, so
 * `useWorkspaceSettings.ts` can invalidate them without importing the appearance query.
 */
export const marcherAppearancesKeys = {
    all: () => [KEY_BASE] as const,
    byPageId: (pageId: number) => [KEY_BASE, { pageId }] as const,
};
