// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { PostHog } from "posthog-js";
import { version } from "../../../package.json";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import {
    forgetStoredUserPaths,
    registerAnalyticsContext,
    releaseChannelOf,
} from "../analyticsContext";

describe("releaseChannelOf", () => {
    it.each([
        ["0.1.7", "release"],
        ["0.2.0", "release"],
        ["0.2.0-beta.6", "beta"],
        ["0.2.0-nightly.20261122.268", "nightly"],
        ["0.2.0-alpha-nightly.20261102.123", "alpha-nightly"],
        ["0.2.0-rc.1", "rc"],
        ["1.0.0+build.5", "release"],
        ["0.2.0-beta+exp.1", "beta"],
    ])("%s is %s", (input, channel) => {
        expect(releaseChannelOf(input)).toBe(channel);
    });
});

describe("registerAnalyticsContext", () => {
    it("registers the version, channel and current mode, and follows mode changes", () => {
        const register = vi.fn();
        useEditorModeStore.setState({ mode: "basic", loaded: true });
        registerAnalyticsContext({ register } as unknown as PostHog);
        expect(register).toHaveBeenCalledWith({
            app_version: version,
            release_channel: releaseChannelOf(version),
        });
        expect(register).toHaveBeenCalledWith({ editor_mode: "basic" });

        useEditorModeStore.setState({ mode: "expert" });
        expect(register).toHaveBeenLastCalledWith({ editor_mode: "expert" });
    });
});

describe("forgetStoredUserPaths", () => {
    function posthogWith(stored: unknown) {
        return { get_property: vi.fn(() => stored), unregister: vi.fn() };
    }

    it("forgets a stored first page that names the user", () => {
        const posthog = posthogWith({
            r: "$direct",
            u: "file:///C:/Users/JaneDoe/AppData/Local/Programs/OpenMarch/resources/app.asar/dist/index.html",
        });
        forgetStoredUserPaths(posthog);
        expect(posthog.unregister).toHaveBeenCalledWith("$initial_person_info");
    });

    it.each([[{ r: "$direct", u: "app://openmarch/index.html" }], [undefined]])(
        "keeps %j",
        (stored) => {
            const posthog = posthogWith(stored);
            forgetStoredUserPaths(posthog);
            expect(posthog.unregister).not.toHaveBeenCalled();
        },
    );
});
