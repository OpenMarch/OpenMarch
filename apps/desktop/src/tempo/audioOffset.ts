/**
 * Tempo mode: where the music sits against the counts (the audio offset), as part of
 * the show's history. Tempo mode moves the music (the first hit onto count 1, owner 2026-10-21)
 * and that has to undo with the counts it lined up, so the offset lives in `tempo_settings`, a
 * table with history triggers. A show that never set it there uses its workspace setting.
 *
 * Every reader of the offset goes through `useAudioOffsetSeconds` / `readAudioOffsetSeconds` (or
 * `readShowAudioOffsetSeconds`, for a reader that falls back on its own copy of the workspace setting).
 */
import { useQuery } from "@tanstack/react-query";
import { eq } from "drizzle-orm";
import { db, schema } from "@/global/database/db";
import { transactionWithHistory } from "@/db-functions/history";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";

/** Undo and redo refresh queries named after the tables they touched (`tableNamesToQueryKeys`) */
export const tempoSettingsKey = ["tempo_settings"] as const;

async function readRow(conn: DbConnection | DbTransaction) {
    try {
        return (
            (await conn
                .select()
                .from(schema.tempo_settings)
                .where(eq(schema.tempo_settings.id, 0))
                .get()) ?? null
        );
    } catch {
        // a file from before the table (not converted yet)
        return null;
    }
}

export const tempoSettingsQueryOptions = (enabled = true) => ({
    queryKey: tempoSettingsKey,
    queryFn: () => readRow(db),
    enabled,
});

/** The offset in effect: the show's history value, else the workspace setting */
export const effectiveAudioOffset = (
    row: { audio_offset_seconds: number | null } | null | undefined,
    workspaceOffset: number | undefined,
): number => row?.audio_offset_seconds ?? workspaceOffset ?? 0;

/** The audio offset in effect, in seconds (positive: the music starts later) */
export function useAudioOffsetSeconds(): number {
    const ready = useDatabaseReady();
    const { data: row } = useQuery(tempoSettingsQueryOptions(ready));
    const { data: settings } = useQuery(workspaceSettingsQueryOptions(ready));
    return effectiveAudioOffset(row, settings?.audioOffsetSeconds);
}

/** `useAudioOffsetSeconds` outside React */
export async function readAudioOffsetSeconds(
    conn: DbConnection | DbTransaction,
    workspaceOffset: number | undefined,
): Promise<number> {
    return effectiveAudioOffset(await readRow(conn), workspaceOffset);
}

/** The offset the show itself stores (`tempo_settings`), or null when it never set one */
export async function readShowAudioOffsetSeconds(
    conn: DbConnection | DbTransaction,
): Promise<number | null> {
    return (await readRow(conn))?.audio_offset_seconds ?? null;
}

/** Set the offset inside an edit, so it undoes with it */
export async function setAudioOffsetInTransaction(
    tx: DbTransaction,
    seconds: number,
): Promise<void> {
    await tx
        .insert(schema.tempo_settings)
        .values({ id: 0, audio_offset_seconds: seconds })
        .onConflictDoUpdate({
            target: schema.tempo_settings.id,
            set: { audio_offset_seconds: seconds },
        });
}

/** Set the offset as an edit of its own: one undo step */
export async function writeAudioOffset(seconds: number): Promise<void> {
    await transactionWithHistory(db, "audioOffset", (tx) =>
        setAudioOffsetInTransaction(tx, seconds),
    );
}
