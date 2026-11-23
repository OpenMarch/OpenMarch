/**
 * The person's Discord status while OpenMarch runs: "Playing OpenMarch — Designing a show" and
 * how long the show has been open. It names the show only when the person opts in
 * (`DISCORD_SHOW_NAME_SETTING`): show names can be private.
 * Settings > Privacy turns it off (`DISCORD_PRESENCE_SETTING`).
 *
 * Discord need not be running: OpenMarch tries again every so often, and sets the status as
 * soon as Discord answers. If Discord quits, it waits for it to come back.
 */
import { basename, extname } from "node:path";
import type { DiscordActivity, DiscordIpcConnection } from "./discordIpc";

/**
 * The OpenMarch application in the Discord developer portal. Its name is what Discord shows
 * after "Playing", and its Rich Presence art holds the `openmarch` image. Not a secret.
 */
export const DISCORD_CLIENT_ID = "1574144987417935975";

/** The Rich Presence art key of the OpenMarch logo in the developer portal */
export const DISCORD_LOGO_ASSET = "openmarch";

const RETRY_MS = 30_000;

/** Discord refuses a status line shorter than 2 or longer than 128 characters */
const STATE_MAX_LENGTH = 128;

/** The show's file name without `.dots`, as Discord's second status line */
function showNameForStatus(showPath: string): string | undefined {
    const file = basename(showPath);
    const name = (
        extname(file).toLowerCase() === ".dots"
            ? file.slice(0, -".dots".length)
            : file
    ).trim();
    if (name.length < 2) return undefined;
    if (name.length <= STATE_MAX_LENGTH) return name;
    // Cut by whole characters so an emoji is never split in half, then fit the UTF-16 limit
    let cut = "";
    for (const char of name) {
        if (cut.length + char.length > STATE_MAX_LENGTH - 1) break;
        cut += char;
    }
    return `${cut}…`;
}

/** What OpenMarch is showing right now, from the main process's point of view */
export interface PresenceScreen {
    /** The open show's file, or "" on the launch page */
    showPath: string;
    /** The open show is a new show that hasn't been saved anywhere yet */
    isNewShowDraft: boolean;
}

/**
 * The status for what's on screen. `startedAt` is when the show opened, for the elapsed time.
 * `t` is main's translator, so the status follows the app language. `showName` adds the open
 * show's name as a second line; off unless the person turned it on.
 */
export function presenceActivity(
    screen: PresenceScreen,
    startedAt: number,
    t: (key: string) => string,
    showName = false,
): DiscordActivity {
    const activity: DiscordActivity = {
        type: 0,
        assets: {
            large_image: DISCORD_LOGO_ASSET,
            large_text: "OpenMarch", // i18n-ignore: product name
        },
        buttons: [
            {
                label: t("discord.presence.getOpenMarch"),
                url: "https://openmarch.com",
            },
        ],
    };
    if (!screen.showPath) {
        activity.details = t("discord.presence.launchPage");
        return activity;
    }
    activity.timestamps = { start: startedAt };
    if (screen.isNewShowDraft) {
        activity.details = t("discord.presence.newShow");
        return activity;
    }
    activity.details = t("discord.presence.designing");
    if (showName) {
        const name = showNameForStatus(screen.showPath);
        if (name) activity.state = name;
    }
    return activity;
}

export interface DiscordPresenceDeps {
    clientId: string;
    connect: () => Promise<DiscordIpcConnection>;
    /** Settings > Privacy: show OpenMarch in the Discord status */
    isEnabled: () => boolean;
    /** Settings > Privacy: also show the open show's name. Off unless turned on. */
    showsShowName?: () => boolean;
    t: (key: string) => string;
    now?: () => number;
    retryMs?: number;
}

export interface DiscordPresence {
    /** Call when the screen changes: a show opened or closed */
    setScreen(screen: PresenceScreen): void;
    /** Call when a setting or the app language changes */
    refresh(): void;
    /** Disconnects for good (the app is quitting); Discord clears the status */
    stop(): void;
}

export function createDiscordPresence({
    clientId,
    connect,
    isEnabled,
    showsShowName = () => false,
    t,
    now = Date.now,
    retryMs = RETRY_MS,
}: DiscordPresenceDeps): DiscordPresence {
    let screen: PresenceScreen = { showPath: "", isNewShowDraft: false };
    let startedAt = now();
    let connection: DiscordIpcConnection | null = null;
    let connecting = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    /** The last reason Discord couldn't be reached, logged once rather than every retry */
    let lastFailure = "";

    const wanted = () => !stopped && !!clientId && isEnabled();

    const send = () => {
        connection?.setActivity(
            presenceActivity(screen, startedAt, t, showsShowName()),
        );
    };

    const scheduleRetry = () => {
        if (retryTimer || !wanted()) return;
        retryTimer = setTimeout(() => {
            retryTimer = null;
            update();
        }, retryMs);
        // Waiting for Discord never keeps the app from quitting
        retryTimer.unref?.();
    };

    const update = () => {
        if (!wanted()) {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = null;
            const open = connection;
            connection = null;
            open?.close();
            return;
        }
        if (connection) {
            send();
            return;
        }
        if (connecting) return;
        connecting = true;
        connect().then(
            (opened) => {
                connecting = false;
                if (!wanted()) {
                    opened.close();
                    return;
                }
                connection = opened;
                lastFailure = "";
                console.log("Discord status: connected to Discord");
                opened.onClose(() => {
                    if (connection !== opened) return;
                    // Discord quit or restarted: wait for it to come back
                    connection = null;
                    console.log(
                        "Discord status: Discord closed the connection",
                    );
                    scheduleRetry();
                });
                send();
            },
            (error: unknown) => {
                // Discord isn't running (or isn't installed)
                connecting = false;
                const reason = String((error as Error)?.message ?? error);
                if (reason !== lastFailure)
                    console.log(
                        `Discord status: can't reach Discord (${reason})`,
                    );
                lastFailure = reason;
                scheduleRetry();
            },
        );
    };

    return {
        setScreen(next) {
            if (next.showPath !== screen.showPath) startedAt = now();
            screen = next;
            update();
        },
        refresh: update,
        stop() {
            stopped = true;
            update();
        },
    };
}
