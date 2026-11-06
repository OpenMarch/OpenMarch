/**
 * Sign-in for the web build: the page's answer to the `auth:*` channels the
 * desktop app's main process handles (`electron/main/auth`), so `useAuth`,
 * the API clients and Mobile export work unchanged.
 *
 * Like the desktop app and app.openmarch.com, signing in happens on Clerk's
 * hosted pages (the Account Portal), never in the editor. The page opens
 * them in a new tab, so the editor (and a show kept only in memory) stays
 * put. When Clerk is done it sends that tab to `auth-done.html`
 * (`web/public/`), which tells this tab over a BroadcastChannel and closes.
 * The session is Clerk's own, shared by every app on openmarch.com: whoever
 * is signed in to app.openmarch.com is signed in here too.
 *
 * ClerkJS loads from the Clerk instance (as in om-lab), without its UI, and
 * only when something asks about sign-in (opening Mobile export). The API
 * gets Clerk's short-lived session token, which ClerkJS keeps fresh.
 */
import type { AuthState, AuthUser } from "@om-electron/main/auth/types";

/**
 * The BroadcastChannel `auth-done.html` reports on is this plus the build's
 * storage namespace (its `?channel=`). The page has the same prefix inline.
 */
export const AUTH_DONE_CHANNEL_PREFIX = "openmarch-auth-done:";

/** The parts of ClerkJS used here (the browser script's `window.Clerk`). */
export interface ClerkJs {
    loaded: boolean;
    load(options?: Record<string, unknown>): Promise<void>;
    user: ClerkUser | null | undefined;
    session: { getToken(): Promise<string | null> } | null | undefined;
    client:
        | {
              lastActiveSessionId: string | null;
              reload(): Promise<unknown>;
          }
        | undefined;
    buildSignInUrl(options?: Record<string, string>): string;
    setActive(params: { session: string | null }): Promise<void>;
    signOut(callback?: () => void | Promise<void>): Promise<void>;
    addListener(
        callback: (resources: { user?: ClerkUser | null }) => void,
    ): () => void;
}

interface ClerkUser {
    id: string;
    firstName: string | null;
    lastName: string | null;
    imageUrl: string;
    primaryEmailAddress?: { emailAddress: string } | null;
}

declare global {
    interface Window {
        Clerk?: ClerkJs;
    }
}

export interface WebAuthOptions {
    /** Clerk's publishable key (`pk_live_…`), naming its Frontend API host. */
    publishableKey: string;
    /** Names the channel `auth-done.html` reports on (per build's storage). */
    namespace: string;
    /** Sends an `auth:*` event to the app, like `webContents.send`. */
    emit: (channel: string, ...args: unknown[]) => void;
    /** Where `auth-done.html` is, resolved against the page. */
    doneUrl: string;
    /**
     * Asks before this tab leaves the show (pop-ups blocked, so the sign-in
     * happens here); false stays.
     */
    confirmLeave: () => Promise<boolean>;
    /** Leaves for the URL without the browser asking again. */
    leave: (url: string) => void;
    /**
     * Sign in in this tab, never a new one: a Home Screen app on iOS keeps
     * its own cookies and storage, so a sign-in in Safari wouldn't reach it.
     */
    sameTabOnly?: boolean;
    /** Loads ClerkJS; replaced in tests. */
    loadClerk?: (publishableKey: string) => Promise<ClerkJs>;
    /**
     * Another script on the page (the lab's feedback widget) may load the
     * same ClerkJS: wait a little for its load before starting one.
     */
    sharedLoad?: boolean;
}

const SIGNED_OUT: AuthState = {
    isAuthenticated: false,
    isLoading: false,
    user: null,
    error: null,
};

/** Sign-in couldn't start or load (offline, blocked, the instance said no). */
function unavailable(error: unknown) {
    return {
        code: "AUTH_UNAVAILABLE",
        message: "Sign-in couldn't load.",
        details: error instanceof Error ? error.message : error,
    };
}

/** How long to wait for a ClerkJS someone else is loading (the lab widget). */
const SHARED_LOAD_WAIT_MS = 15_000;

/** The Clerk Frontend API host a publishable key names (pk_live_<base64 host$>). */
export function frontendApiHost(publishableKey: string): string {
    return atob(publishableKey.split("_")[2] ?? "").replace(/\$$/, "");
}

/** Loads ClerkJS's browser script from the instance; it makes `window.Clerk`. */
function loadClerkScript(publishableKey: string): Promise<ClerkJs> {
    // The lab's feedback widget may have loaded it already (same instance).
    if (window.Clerk) return Promise.resolve(window.Clerk);
    const host = frontendApiHost(publishableKey);
    const src = `https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`;
    return new Promise((resolve, reject) => {
        // Or it's still loading it: wait for that script, don't add another
        // (and don't wait forever if it already failed).
        const loading = [...document.scripts].find((s) => s.src === src);
        if (loading)
            setTimeout(
                () => reject(new Error("ClerkJS didn't finish loading")),
                SHARED_LOAD_WAIT_MS,
            );
        const script = loading ?? document.createElement("script");
        script.addEventListener("load", () =>
            window.Clerk
                ? resolve(window.Clerk)
                : reject(
                      new Error("ClerkJS loaded without making window.Clerk"),
                  ),
        );
        script.addEventListener("error", () =>
            reject(new Error(`Couldn't load ClerkJS from ${host}`)),
        );
        if (loading) return;
        script.src = src;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.dataset.clerkPublishableKey = publishableKey;
        document.head.append(script);
    });
}

/** Resolves once `done()` is true, or after `ms` either way. */
function waitFor(done: () => boolean, ms: number): Promise<void> {
    return new Promise((resolve) => {
        const start = Date.now();
        const check = () =>
            done() || Date.now() - start >= ms
                ? resolve()
                : setTimeout(check, 100);
        check();
    });
}

function toAuthUser(user: ClerkUser): AuthUser {
    return {
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? null,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl || null,
    };
}

function stateOf(clerk: ClerkJs): AuthState {
    return clerk.user
        ? {
              isAuthenticated: true,
              isLoading: false,
              user: toAuthUser(clerk.user),
              error: null,
          }
        : SIGNED_OUT;
}

/** The `auth:*` handlers, by channel. */
// eslint-disable-next-line max-lines-per-function
export function createWebAuth(options: WebAuthOptions) {
    const { publishableKey, emit } = options;
    let clerkPromise: Promise<ClerkJs> | null = null;
    /** A sign-in tab is open: check again when this tab is back in front. */
    let waitingForSignIn = false;
    let lastUserId: string | null | undefined;

    function notify(state: AuthState) {
        lastUserId = state.user?.id ?? null;
        emit("auth:state-changed", state);
    }

    function clerk(): Promise<ClerkJs> {
        clerkPromise ??= (async () => {
            // Someone else (the lab widget) got here first if ClerkJS or its
            // script is already on the page: let them finish its load rather
            // than load it twice at once. Otherwise there's no one to wait for.
            const othersLoading =
                options.sharedLoad &&
                (!!window.Clerk ||
                    [...document.scripts].some((script) =>
                        script.src.includes("/@clerk/clerk-js@"),
                    ));
            const instance = await (options.loadClerk ?? loadClerkScript)(
                publishableKey,
            );
            if (!instance.loaded && othersLoading)
                await waitFor(() => instance.loaded, SHARED_LOAD_WAIT_MS);
            if (!instance.loaded)
                await instance.load({
                    // ClerkJS never navigates the editor away: a reload
                    // would lose a show kept only in memory.
                    routerPush: () => {},
                    routerReplace: () => {},
                });
            // ClerkJS can return without loading (the instance turned this
            // site down, or the network failed); nothing works then.
            if (!instance.loaded) throw new Error("ClerkJS didn't load");
            lastUserId = instance.user?.id ?? null;
            // Session changes ClerkJS sees itself (it expired, or signed out
            // in another tab of this site).
            instance.addListener(({ user }) => {
                if ((user?.id ?? null) !== lastUserId)
                    notify(stateOf(instance));
            });
            return instance;
        })();
        // A failed load (offline, blocked) is tried again next time.
        clerkPromise.catch(() => (clerkPromise = null));
        return clerkPromise;
    }

    /**
     * Picks up a sign-in finished in another tab: ClerkJS only learns of it
     * by asking the Frontend API again.
     */
    async function refresh() {
        const instance = await clerk();
        await instance.client?.reload();
        const sessionId = instance.client?.lastActiveSessionId;
        if (!instance.session && sessionId)
            await instance.setActive({ session: sessionId });
        notify(stateOf(instance));
    }

    const channel =
        typeof BroadcastChannel === "undefined"
            ? null
            : new BroadcastChannel(
                  `${AUTH_DONE_CHANNEL_PREFIX}${options.namespace}`,
              );
    channel?.addEventListener("message", () => {
        waitingForSignIn = false;
        void refresh().catch((error) =>
            console.error("[Auth] Couldn't pick up the sign-in", error),
        );
    });

    // Back from the sign-in tab without the message (closed it, or the
    // browser has no BroadcastChannel): check, which also ends "Signing in…".
    window.addEventListener("focus", () => {
        if (!waitingForSignIn) return;
        waitingForSignIn = false;
        // A failed check leaves the state as it was, and ends "Signing in…".
        void refresh().catch(() =>
            clerk()
                .then((instance) => notify(stateOf(instance)))
                .catch((error) =>
                    notify({ ...SIGNED_OUT, error: unavailable(error) }),
                ),
        );
    });

    return {
        "auth:get-state": async (): Promise<AuthState> => {
            try {
                return stateOf(await clerk());
            } catch (error) {
                return { ...SIGNED_OUT, error: unavailable(error) };
            }
        },

        "auth:get-access-token": async () => {
            try {
                const instance = await clerk();
                return { token: (await instance.session?.getToken()) ?? null };
            } catch {
                return { token: null };
            }
        },

        "auth:login": async () => {
            // Open the tab before anything waits, while the click still
            // counts as the user's (Safari blocks pop-ups after that).
            const tab = options.sameTabOnly
                ? null
                : window.open("about:blank", "_blank");
            try {
                const instance = await clerk();
                const signInUrl = (redirectUrl: string) =>
                    instance.buildSignInUrl({
                        redirectUrl,
                        signInForceRedirectUrl: redirectUrl,
                        signUpForceRedirectUrl: redirectUrl,
                    });
                if (!signInUrl(options.doneUrl))
                    throw new Error("Clerk has no sign-in page");
                if (tab) {
                    // Clerk's pages get no handle on this tab.
                    tab.opener = null;
                    tab.location.href = signInUrl(options.doneUrl);
                    waitingForSignIn = true;
                } else if (await options.confirmLeave()) {
                    // Pop-ups blocked, or a Home Screen app: sign in in this
                    // tab and come back.
                    options.leave(signInUrl(window.location.href));
                } else {
                    // Stayed for the show: ends "Signing in…".
                    notify(stateOf(instance));
                }
                return { success: true };
            } catch (error) {
                tab?.close();
                return { success: false, error: unavailable(error) };
            }
        },

        "auth:logout": async () => {
            try {
                const instance = await clerk();
                // Ends the Clerk session (every openmarch.com app). The
                // callback stands in for ClerkJS's navigation away.
                await instance.signOut(() => {});
                notify(SIGNED_OUT);
                return { success: true };
            } catch (error) {
                return { success: false, error: unavailable(error) };
            }
        },
    };
}
