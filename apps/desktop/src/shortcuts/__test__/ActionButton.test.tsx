import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import ActionButton from "../ActionButton";
import { getActionLabel, getActionTooltip } from "../labels";
import { registerActionHandler } from "../registry";

const t = (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key;

const Providers = ({ children }: { children: React.ReactNode }) => (
    <TolgeeProvider tolgee={tolgee} fallback="Loading...">
        {children}
    </TolgeeProvider>
);

describe("labels", () => {
    it("builds suffix and param labels", () => {
        expect(getActionLabel("moveSelectedMarchersUpFine", t)).toBe(
            "actions.movement.moveUp (actions.movement.variants.fine)",
        );
        expect(getActionLabel("timelineTapBeats2", t)).toBe(
            'actions.timeline.tapBeats:{"count":2}',
        );
    });

    it("tooltip uses toggle key and platform binding", () => {
        expect(
            getActionTooltip("lockX", t, { toggleState: "on", isMac: false }),
        ).toBe("actions.alignment.lockXOn [Y]");
        expect(getActionTooltip("performUndo", t, { isMac: true })).toBe(
            "actions.edit.undo [⌘Z]",
        );
        expect(
            getActionTooltip("launchLoadFileDialogue", t, { isMac: false }),
        ).toBe("actions.file.loadDialogue");
    });
});

describe("ActionButton", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => cleanup());

    it("runs the action on click", () => {
        const run = vi.fn();
        const off = registerActionHandler("flipHorizontal", {
            run,
            isEnabled: () => true,
        });
        render(<ActionButton action="flipHorizontal">Flip</ActionButton>, {
            wrapper: Providers,
        });
        fireEvent.click(screen.getByRole("button", { name: "Flip" }));
        expect(run).toHaveBeenCalledTimes(1);
        off();
    });
});
