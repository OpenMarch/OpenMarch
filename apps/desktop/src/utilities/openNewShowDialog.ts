export const NEW_SHOW_DIALOG_SESSION_KEY = "openmarch:openNewShowDialog";
export const OPEN_NEW_SHOW_DIALOG_EVENT = "open-new-show-dialog";

export async function requestOpenNewShowDialog(): Promise<void> {
    sessionStorage.setItem(NEW_SHOW_DIALOG_SESSION_KEY, "1");
    const dbReady = await window.electron.databaseIsReady();
    if (dbReady) {
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
