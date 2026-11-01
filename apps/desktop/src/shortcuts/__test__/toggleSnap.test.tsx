import {
    act,
    cleanup,
    render,
    renderHook,
    screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TolgeeProvider } from "@tolgee/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { ACTIONS } from "../definitions";
import { buildKeymap, findConflicts } from "../keymap";
import CommandPalette from "../palette/CommandPalette";
import { runAction } from "../registry";
import { useAlignmentActionHandlers } from "../handlers/useAlignmentActionHandlers";

/**
 * "Toggle Snap" turns the Snap toggle (modifier roles, version A) off and on from its key,
 * Shift+M, or the command palette, as Lock X and Lock Y do. Shift+S, the obvious key, is the fine
 * nudge down (Shift with the S of W/A/S/D), so the toggle takes M, for the magnet on its buttons.
 */

const Providers = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            {children}
        </TolgeeProvider>
    </QueryClientProvider>
);

const snapOn = () => useUiSettingsStore.getState().uiSettings.snap;

beforeAll(async () => {
    // jsdom has no layout, so it doesn't implement scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    act(() => {
        useUiSettingsStore.getState().setSnap(true);
    });
    localStorage.clear();
});

describe("Toggle Snap", () => {
    it("is bound to Shift+M, with no conflict on any platform", () => {
        expect(ACTIONS.toggleSnap.defaultBindings).toEqual(["Shift+M"]);
        for (const isMac of [false, true]) {
            const conflicts = findConflicts({}, ACTIONS, isMac);
            expect(
                conflicts.filter((c) => c.actionIds.includes("toggleSnap")),
            ).toEqual([]);
        }
        // Shift+S stays the fine nudge down
        expect(
            buildKeymap({}, ACTIONS, false)
                .filter((e) => e.binding === "Shift+S")
                .map((e) => e.id),
        ).toEqual(["moveSelectedMarchersDownFine"]);
    });

    it("turns snapping off and on again, beside Lock X and Lock Y", () => {
        renderHook(() => useAlignmentActionHandlers(), { wrapper: Providers });
        expect(snapOn()).toBe(true);
        act(() => {
            runAction("toggleSnap");
        });
        expect(snapOn()).toBe(false);
        act(() => {
            runAction("toggleSnap");
        });
        expect(snapOn()).toBe(true);
    });

    it("is in the command palette, as the lock toggles are", () => {
        render(
            <Providers>
                <Handlers />
                <CommandPalette />
            </Providers>,
        );
        act(() => {
            runAction("openCommandPalette");
        });
        const labels = screen
            .getAllByRole("option")
            .map((o) => o.textContent ?? "");
        expect(labels.some((l) => l.startsWith("Lock X axis"))).toBe(true);
        expect(labels.some((l) => l.startsWith("Toggle Snap"))).toBe(true);
    });
});

function Handlers() {
    useAlignmentActionHandlers();
    return null;
}
