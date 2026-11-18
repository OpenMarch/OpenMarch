/**
 * `window.view3dFollowTest`: lets scripted checks follow a performer by id in
 * the 3D View window, as the field's `window.fieldTest` does for the editor.
 * Clicking a performer needs their place on screen, which a script doesn't
 * know.
 */
import { useFollowStore, type FollowMode } from "./followStore";

export interface FollowTestApi {
    /** Follows the marcher, from behind or through their eyes. */
    follow: (marcherId: number, mode?: FollowMode) => void;
    /** Stops following. */
    stop: () => void;
}

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        /** Following a performer in the 3D View; see `followTestApi.ts`. */
        view3dFollowTest?: FollowTestApi;
    }
}

/** Installs `window.view3dFollowTest`; returns a function that removes it. */
export function installFollowTestApi(): () => void {
    window.view3dFollowTest = {
        follow: (marcherId, mode = "third") => {
            const store = useFollowStore.getState();
            if (store.follow?.marcherId === marcherId) store.setMode(mode);
            else store.followMarcher(marcherId, mode);
        },
        stop: () => useFollowStore.getState().stop(),
    };
    return () => {
        delete window.view3dFollowTest;
    };
}
