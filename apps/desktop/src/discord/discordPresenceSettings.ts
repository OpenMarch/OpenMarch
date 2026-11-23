/**
 * Settings for the Discord status (Discord Rich Presence), shared by Settings > Privacy and the
 * main process, which talks to the Discord app. Desktop only: a browser page can't reach it.
 */

/** Show "Using OpenMarch" in the person's Discord status. On unless they turn it off. */
export const DISCORD_PRESENCE_SETTING = "discordPresence";

/** Never answered reads as on, so only an explicit `false` turns the status off. */
export const discordPresenceEnabled = (saved: unknown): boolean =>
    saved !== false;

/** Also show the open show's name in the Discord status. Off unless turned on: names can be private. */
export const DISCORD_SHOW_NAME_SETTING = "discordPresenceShowName";

/** Only an explicit `true` shows the show's name. */
export const discordShowNameEnabled = (saved: unknown): boolean =>
    saved === true;
