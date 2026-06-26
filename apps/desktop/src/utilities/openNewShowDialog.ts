import { queryClient } from "@/App";
import { invalidateDatabaseReadyQueries } from "@/hooks/useDatabaseReady";

export const NEW_SHOW_DIALOG_SESSION_KEY = "openmarch:openNewShowDialog";
export const OPEN_NEW_SHOW_DIALOG_EVENT = "open-new-show-dialog";

export async function requestOpenNewShowDialog(): Promise<void> {
    const dbReady = await window.electron.databaseIsReady();
    if (dbReady) {
        sessionStorage.setItem(NEW_SHOW_DIALOG_SESSION_KEY, "1");
        await invalidateDatabaseReadyQueries(queryClient);
        await window.electron.closeCurrentFile();
    } else {
        window.dispatchEvent(new CustomEvent(OPEN_NEW_SHOW_DIALOG_EVENT));
    }
}

export function shouldOpenNewShowDialogFromSession(): boolean {
    return sessionStorage.getItem(NEW_SHOW_DIALOG_SESSION_KEY) === "1";
}

export function clearNewShowDialogSessionFlag(): void {
    sessionStorage.removeItem(NEW_SHOW_DIALOG_SESSION_KEY);
}
