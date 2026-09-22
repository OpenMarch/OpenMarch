import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import ShortcutSettings from "../ShortcutSettings";
import {
    SHORTCUT_OVERRIDES_STORAGE_KEY,
    useShortcutOverridesStore,
} from "@/stores/ShortcutOverridesStore";

const Providers = ({ children }: { children: React.ReactNode }) => (
    <TolgeeProvider tolgee={tolgee} fallback="Loading...">
        {children}
    </TolgeeProvider>
);

function rowFor(label: RegExp) {
    return screen.getByText(label).closest("li") as HTMLElement;
}

function search(text: string) {
    fireEvent.change(screen.getByRole("searchbox"), {
        target: { value: text },
    });
}

function press(init: KeyboardEventInit) {
    act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", init));
    });
}

describe("ShortcutSettings", () => {
    beforeAll(async () => {
        await tolgee.run();
    });

    afterEach(() => {
        cleanup();
        act(() => {
            useShortcutOverridesStore.getState().resetAll();
        });
        localStorage.clear();
    });

    it("records a new binding and saves it", () => {
        render(<ShortcutSettings />, { wrapper: Providers });
        search("next page");
        const row = rowFor(/^Next page$/);
        fireEvent.click(within(row).getByLabelText(/Add shortcut/));
        expect(within(row).getByRole("status")).toBeInTheDocument();

        press({ key: "k", code: "KeyK" });

        expect(within(row).getByText("K")).toBeInTheDocument();
        expect(
            JSON.parse(localStorage.getItem(SHORTCUT_OVERRIDES_STORAGE_KEY)!),
        ).toEqual({ nextPage: ["E", "K"] });
    });

    it("matches every search word anywhere in the label", () => {
        render(<ShortcutSettings />, { wrapper: Providers });
        search("up move ¼");
        expect(
            screen.getByText("Move selected marcher(s) up (¼ step, no snap)"),
        ).toBeInTheDocument();
        expect(screen.queryByText(/marcher\(s\) down/)).toBeNull();
    });

    it("cancels recording with Escape", () => {
        render(<ShortcutSettings />, { wrapper: Providers });
        search("next page");
        const row = rowFor(/^Next page$/);
        fireEvent.click(within(row).getByLabelText(/Add shortcut/));
        press({ key: "Escape", code: "Escape" });
        expect(within(row).queryByRole("status")).toBeNull();
        expect(useShortcutOverridesStore.getState().overrides).toEqual({});
    });

    it("warns on a conflict and reassigns on request", () => {
        render(<ShortcutSettings />, { wrapper: Providers });
        search("page");
        const row = rowFor(/^Next page$/);
        fireEvent.click(within(row).getByLabelText(/Add shortcut/));
        press({ key: "q", code: "KeyQ" });

        const alert = within(row).getByRole("alert");
        expect(alert).toHaveTextContent(/Previous page/);
        expect(useShortcutOverridesStore.getState().overrides).toEqual({});

        fireEvent.click(
            within(alert).getByRole("button", { name: /Reassign/ }),
        );
        expect(useShortcutOverridesStore.getState().overrides).toEqual({
            nextPage: ["E", "Q"],
            previousPage: [],
        });
    });

    it("removes a binding and resets the row", () => {
        render(<ShortcutSettings />, { wrapper: Providers });
        search("next page");
        const row = rowFor(/^Next page$/);
        fireEvent.click(within(row).getByLabelText("Remove E"));
        expect(within(row).queryByText("E")).toBeNull();

        fireEvent.click(within(row).getByLabelText(/Reset/));
        expect(within(row).getByText("E")).toBeInTheDocument();
        expect(useShortcutOverridesStore.getState().overrides).toEqual({});
    });
});
