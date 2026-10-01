import { eq } from "drizzle-orm";
import { validateHome, type XY } from "@openmarch/core";
import * as schema from "@om-electron/database/migrations/schema";
import { DbTransaction } from "./types";
import { assertValid, mapDbErrors, refuse } from "./timelineErrors";

export interface ModifiedMarcherHomeArgs {
    marcherId: number;
    /** The marcher's home as `[x, y]`: finite, each within [-1e6, 1e6] (I-N2) */
    home: XY;
}

/**
 * Sets marchers' homes (`marchers.home_x`/`home_y`, C-5). Every home is validated (E-N2) before
 * the first write. The existing `marchers` history triggers make it undoable, and the timeline
 * change-log trigger logs it (spec 10.2).
 */
export const updateMarcherHomesInTransaction = async ({
    modifiedHomes,
    tx,
}: {
    modifiedHomes: ModifiedMarcherHomeArgs[];
    tx: DbTransaction;
}): Promise<(typeof schema.marchers.$inferSelect)[]> => {
    for (const { home } of modifiedHomes)
        assertValid(validateHome(home), "marcher home");
    const updated: (typeof schema.marchers.$inferSelect)[] = [];
    for (const { marcherId, home } of modifiedHomes) {
        const row = await mapDbErrors(() =>
            tx
                .update(schema.marchers)
                .set({ home_x: home[0], home_y: home[1] })
                .where(eq(schema.marchers.id, marcherId))
                .returning()
                .get(),
        );
        if (!row) refuse(`marcher ${marcherId} does not exist`);
        updated.push(row);
    }
    return updated;
};
