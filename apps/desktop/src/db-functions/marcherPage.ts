import { asc, gt, eq, lt, desc } from "drizzle-orm";
import { DbTransaction } from "./types";
import { schema } from "@/global/database/db";

type MarcherPageIdentifier =
    | {
          marcherId: number;
          pageId: number;
      }
    | { marcherPageId: number };

async function getMarcherPageByPosition(
    tx: DbTransaction,
    id: MarcherPageIdentifier,
    direction: "next" | "previous",
): Promise<typeof schema.marcher_pages.$inferSelect | null> {
    const idCheck = () =>
        "marcherId" in id
            ? eq(schema.marcher_pages.marcher_id, id.marcherId) &&
              eq(schema.marcher_pages.page_id, id.pageId)
            : eq(schema.marcher_pages.id, id.marcherPageId);

    // Subquery: current marcher_id and current beat position
    const cur = await tx
        .select({
            marcherId: schema.marcher_pages.marcher_id,
            curPos: schema.beats.position,
        })
        .from(schema.marcher_pages)
        .innerJoin(
            schema.pages,
            eq(schema.pages.id, schema.marcher_pages.page_id),
        )
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .where(idCheck())
        .limit(1)
        .as("cur");

    if (cur === undefined) {
        return null;
    }

    // Main query: marcher_pages for same marcher where beat.position is greater/less than curPos
    const comparison =
        direction === "next"
            ? gt(schema.beats.position, cur.curPos)
            : lt(schema.beats.position, cur.curPos);

    const ordering =
        direction === "next"
            ? asc(schema.beats.position)
            : desc(schema.beats.position);

    const rows = await tx
        .select({ mp: schema.marcher_pages })
        .from(schema.marcher_pages)
        .innerJoin(
            schema.pages,
            eq(schema.pages.id, schema.marcher_pages.page_id),
        )
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .innerJoin(cur, eq(cur.marcherId, schema.marcher_pages.marcher_id))
        .where(comparison)
        .orderBy(ordering)
        .limit(1);

    return rows[0]?.mp ?? null;
}

export async function getNextMarcherPage(
    tx: DbTransaction,
    id: MarcherPageIdentifier,
): Promise<typeof schema.marcher_pages.$inferSelect | null> {
    return getMarcherPageByPosition(tx, id, "next");
}

export async function getPreviousMarcherPage(
    tx: DbTransaction,
    id: MarcherPageIdentifier,
): Promise<typeof schema.marcher_pages.$inferSelect | null> {
    return getMarcherPageByPosition(tx, id, "previous");
}
