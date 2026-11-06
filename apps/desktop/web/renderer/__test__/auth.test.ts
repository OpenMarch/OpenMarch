import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    AUTH_DONE_CHANNEL_PREFIX,
    createWebAuth,
    frontendApiHost,
    type ClerkJs,
} from "../auth";

// cspell:disable-next-line
const PUBLISHABLE_KEY = "pk_live_Y2xlcmsub3Blbm1hcmNoLmNvbSQ"; // clerk.openmarch.com

type Listener = (resources: { user?: ClerkJs["user"] }) => void;

const USER = {
    id: "user_1",
    firstName: "Ada",
    lastName: "Drum",
    imageUrl: "https://img.clerk.com/ada.png",
    primaryEmailAddress: { emailAddress: "ada@example.com" },
};

/** A stand-in for ClerkJS: signed out until a sign-in "happens elsewhere". */
function fakeClerk() {
    const listeners: Listener[] = [];
    let signedInElsewhere = false;
    const clerk = {
        loaded: false,
        user: null as ClerkJs["user"],
        session: null as ClerkJs["session"],
        client: {
            lastActiveSessionId: null as string | null,
            reload: vi.fn(async () => {
                if (signedInElsewhere)
                    clerk.client.lastActiveSessionId = "session_1";
            }),
        },
        load: vi.fn(async () => {
            clerk.loaded = true;
        }),
        buildSignInUrl: vi.fn(
            (options?: Record<string, string>) =>
                `https://accounts.openmarch.com/sign-in?redirect_url=${encodeURIComponent(options?.redirectUrl ?? "")}`,
        ),
        setActive: vi.fn(async ({ session }: { session: string | null }) => {
            if (session === "session_1") clerk.signIn();
        }),
        signOut: vi.fn(async (_callback?: () => void) => {
            clerk.user = null;
            clerk.session = null;
        }),
        addListener: vi.fn((callback: Listener) => {
            listeners.push(callback);
            return () => {};
        }),
        signIn() {
            clerk.user = USER;
            clerk.session = { getToken: async () => "session-jwt" };
        },
        signInElsewhere() {
            signedInElsewhere = true;
        },
        fire() {
            for (const listener of listeners) listener({ user: clerk.user });
        },
    };
    return clerk;
}

const DONE_URL = "https://editor.openmarch.com/auth-done.html?channel=stable";

function setUp(clerk = fakeClerk(), confirmLeave = async () => true) {
    const emit = vi.fn();
    const handlers = createWebAuth({
        publishableKey: PUBLISHABLE_KEY,
        namespace: `test-${Math.random()}`,
        emit,
        doneUrl: DONE_URL,
        confirmLeave,
        loadClerk: async () => clerk as unknown as ClerkJs,
    });
    return { clerk, emit, handlers };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("web sign-in", () => {
    let openSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        openSpy = vi.spyOn(window, "open");
    });
    afterEach(() => {
        openSpy.mockRestore();
    });

    it("reads the Clerk instance host from the publishable key", () => {
        expect(frontendApiHost(PUBLISHABLE_KEY)).toBe("clerk.openmarch.com");
    });

    it("reports the signed-in Clerk user and its session token", async () => {
        const clerk = fakeClerk();
        clerk.signIn();
        const { handlers } = setUp(clerk);

        expect(await handlers["auth:get-state"]()).toEqual({
            isAuthenticated: true,
            isLoading: false,
            user: {
                id: "user_1",
                email: "ada@example.com",
                firstName: "Ada",
                lastName: "Drum",
                imageUrl: "https://img.clerk.com/ada.png",
            },
            error: null,
        });
        expect(await handlers["auth:get-access-token"]()).toEqual({
            token: "session-jwt",
        });
        // Loaded without letting ClerkJS navigate the editor.
        expect(clerk.load).toHaveBeenCalledWith(
            expect.objectContaining({ routerPush: expect.any(Function) }),
        );
    });

    it("opens the hosted sign-in in a new tab that comes back to auth-done.html", async () => {
        const tab = { opener: window, location: { href: "about:blank" } };
        openSpy.mockReturnValue(tab as unknown as Window);
        const { clerk, handlers } = setUp();

        expect(await handlers["auth:login"]()).toEqual({ success: true });

        expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank");
        expect(tab.opener).toBeNull();
        expect(clerk.buildSignInUrl).toHaveBeenCalledWith({
            redirectUrl: DONE_URL,
            signInForceRedirectUrl: DONE_URL,
            signUpForceRedirectUrl: DONE_URL,
        });
        expect(tab.location.href).toContain("accounts.openmarch.com/sign-in");
    });

    it("picks up the sign-in when auth-done.html reports it", async () => {
        openSpy.mockReturnValue({
            opener: null,
            location: { href: "" },
        } as unknown as Window);
        const namespace = "stable-done-test";
        const clerk = fakeClerk();
        const emit = vi.fn();
        const handlers = createWebAuth({
            publishableKey: PUBLISHABLE_KEY,
            namespace,
            emit,
            doneUrl: DONE_URL,
            confirmLeave: async () => true,
            loadClerk: async () => clerk as unknown as ClerkJs,
        });
        await handlers["auth:login"]();

        clerk.signInElsewhere();
        const done = new BroadcastChannel(
            `${AUTH_DONE_CHANNEL_PREFIX}${namespace}`,
        );
        done.postMessage("signed-in");
        done.close();
        await vi.waitFor(() =>
            expect(emit).toHaveBeenCalledWith(
                "auth:state-changed",
                expect.objectContaining({ isAuthenticated: true }),
            ),
        );
        expect(clerk.client.reload).toHaveBeenCalled();
        expect(clerk.setActive).toHaveBeenCalledWith({ session: "session_1" });
    });

    it("ends 'Signing in…' when the user comes back without signing in", async () => {
        openSpy.mockReturnValue({
            opener: null,
            location: { href: "" },
        } as unknown as Window);
        const { emit, handlers } = setUp();
        await handlers["auth:login"]();

        window.dispatchEvent(new Event("focus"));
        await vi.waitFor(() =>
            expect(emit).toHaveBeenCalledWith(
                "auth:state-changed",
                expect.objectContaining({
                    isAuthenticated: false,
                    isLoading: false,
                }),
            ),
        );
    });

    it("stays on the show when pop-ups are blocked and the user says no", async () => {
        openSpy.mockReturnValue(null);
        const confirmLeave = vi.fn(async () => false);
        const { emit, handlers } = setUp(fakeClerk(), confirmLeave);
        const href = window.location.href;

        expect(await handlers["auth:login"]()).toEqual({ success: true });

        expect(confirmLeave).toHaveBeenCalled();
        expect(window.location.href).toBe(href);
        expect(emit).toHaveBeenCalledWith(
            "auth:state-changed",
            expect.objectContaining({ isLoading: false }),
        );
    });

    it("signs out of Clerk without navigating", async () => {
        const clerk = fakeClerk();
        clerk.signIn();
        const { emit, handlers } = setUp(clerk);

        expect(await handlers["auth:logout"]()).toEqual({ success: true });

        expect(clerk.signOut).toHaveBeenCalledWith(expect.any(Function));
        expect(emit).toHaveBeenCalledWith(
            "auth:state-changed",
            expect.objectContaining({ isAuthenticated: false }),
        );
    });

    it("tells the app when ClerkJS sees the session end", async () => {
        const clerk = fakeClerk();
        clerk.signIn();
        const { emit, handlers } = setUp(clerk);
        await handlers["auth:get-state"]();

        clerk.user = null;
        clerk.fire();
        await flush();

        expect(emit).toHaveBeenCalledWith(
            "auth:state-changed",
            expect.objectContaining({ isAuthenticated: false }),
        );
    });

    it("reports sign-in as unavailable when ClerkJS loads without loading", async () => {
        const clerk = fakeClerk();
        clerk.load.mockImplementation(async () => {});
        const { handlers } = setUp(clerk);

        const state = await handlers["auth:get-state"]();
        expect(state.error?.code).toBe("AUTH_UNAVAILABLE");
    });

    it("closes the sign-in tab when sign-in can't load", async () => {
        const tab = { opener: null, location: { href: "" }, close: vi.fn() };
        openSpy.mockReturnValue(tab as unknown as Window);
        const clerk = fakeClerk();
        clerk.load.mockImplementation(async () => {});
        const { handlers } = setUp(clerk);

        const result = await handlers["auth:login"]();
        expect(result.success).toBe(false);
        expect(tab.close).toHaveBeenCalled();
    });

    it("reports sign-in as unavailable when ClerkJS can't load, and tries again", async () => {
        const clerk = fakeClerk();
        const loadClerk = vi
            .fn()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValue(clerk);
        const handlers = createWebAuth({
            publishableKey: PUBLISHABLE_KEY,
            namespace: "unavailable-test",
            emit: vi.fn(),
            doneUrl: DONE_URL,
            confirmLeave: async () => true,
            loadClerk,
        });

        const first = await handlers["auth:get-state"]();
        expect(first.isAuthenticated).toBe(false);
        expect(first.error?.code).toBe("AUTH_UNAVAILABLE");

        const second = await handlers["auth:get-state"]();
        expect(second.error).toBeNull();
        expect(loadClerk).toHaveBeenCalledTimes(2);
    });
});
