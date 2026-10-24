/**
 * The web editor's library actions, for the launch page and the title bar.
 * They go through `window.electron.invoke` to the page's handlers or the
 * worker (`web/renderer/handlers.ts`, `web/worker/index.ts`).
 */
import { toast } from "sonner";
import { WEB_CHANNELS } from "../../../web/protocol";
import { isAppleTouchDevice } from "../../../web/renderer/filePicking";
import type { BackupResult } from "../../../web/renderer/handlers";

import type { Translate } from "@/shortcuts/labels";

const invoke = <T>(channel: string, ...args: unknown[]) =>
    window.electron.invoke(channel, ...args) as Promise<T>;

/** "iPad" wording on an iPad, "browser" elsewhere. */
export const onIpad = isAppleTouchDevice();

export const openStoredShow = (id: string) =>
    invoke<number>(WEB_CHANNELS.openStored, id);

export const renameStoredShow = (id: string, name: string) =>
    invoke<void>(WEB_CHANNELS.renameShow, id, name);

export const duplicateStoredShow = (id: string, copyName: string) =>
    invoke<string>(WEB_CHANNELS.duplicateShow, id, copyName);

export const deleteStoredShow = (id: string) =>
    invoke<void>(WEB_CHANNELS.deleteShow, id);

export const restoreVersion = (id: string, versionId: string) =>
    invoke<boolean>(WEB_CHANNELS.restoreVersion, id, versionId);

/**
 * Backs up a show (the open one without `id`) and says how it went. Call it
 * straight from a tap: the share sheet only opens during one.
 */
export async function backUp(
    t: Translate,
    name: string,
    id?: string | null,
): Promise<BackupResult> {
    try {
        const result = await invoke<BackupResult>("web:backUp", id ?? null);
        if (result === "shared" || result === "downloaded")
            toast.success(t("web.backUpDone", { name }));
        return result;
    } catch (error) {
        toast.error(
            t("web.backUpFailed", {
                name,
                message: error instanceof Error ? error.message : String(error),
            }),
        );
        return "nothing";
    }
}
