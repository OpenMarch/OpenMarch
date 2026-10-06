import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { getActionLabel } from "@/shortcuts/labels";
import SettingsSidebar from "../SettingsSidebar";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "../sections";

beforeEach(() => {
    Object.assign(window, {
        electron: { isMacOS: true, invoke: vi.fn(), send: vi.fn() },
    });
});
afterEach(() => localStorage.clear());

function Harness({ initial = "general" }: { initial?: SettingsSectionId }) {
    const [selected, setSelected] = useState<SettingsSectionId>(initial);
    return (
        <TolgeeProvider tolgee={tolgee} fallback="">
            <SettingsSidebar selected={selected} onSelect={setSelected} />
        </TolgeeProvider>
    );
}

const search = () =>
    screen.findByRole("searchbox", { name: "Search settings" });
const nav = () => screen.getByRole("navigation");

describe("SettingsSidebar", () => {
    it("shows every section's full label", async () => {
        render(<Harness />);
        await search();
        for (const label of [
            "General",
            "Appearance",
            "Mouse & Trackpad",
            "Keyboard shortcuts",
            "Plugins",
            "Privacy",
            "Developer Settings",
            "Database",
        ]) {
            const button = within(nav()).getByRole("button", { name: label });
            expect(button).toHaveTextContent(label);
            expect(button.querySelector(".hidden, .truncate")).toBeNull();
        }
    });

    it("filters by a setting label inside a section", async () => {
        render(<Harness />);
        fireEvent.change(await search(), { target: { value: "zoom" } });
        const buttons = within(nav()).getAllByRole("button");
        expect(buttons.map((b) => b.textContent)).toEqual(["Mouse & Trackpad"]);
    });

    it("filters by a setting label from another section", async () => {
        render(<Harness />);
        fireEvent.change(await search(), { target: { value: "dark" } });
        expect(
            within(nav())
                .getAllByRole("button")
                .map((b) => b.textContent),
        ).toEqual(["Appearance"]);
    });

    it("finds Keyboard shortcuts by the label of one of its actions", async () => {
        render(<Harness />);
        const { t } = tolgee;
        const label = getActionLabel("performUndo", t);
        fireEvent.change(await search(), { target: { value: label } });
        expect(
            within(nav())
                .getAllByRole("button")
                .map((b) => b.textContent),
        ).toContain("Keyboard shortcuts");
    });

    it("shows a message when nothing matches", async () => {
        render(<Harness />);
        fireEvent.change(await search(), {
            target: { value: "nonexistent setting" },
        });
        expect(screen.getByText("No settings match.")).toBeVisible();
        expect(within(nav()).queryAllByRole("button")).toHaveLength(0);
    });

    it("clears the search on Escape", async () => {
        render(<Harness />);
        const box = await search();
        fireEvent.change(box, { target: { value: "zoom" } });
        fireEvent.keyDown(box, { key: "Escape" });
        expect(box).toHaveValue("");
        expect(within(nav()).getAllByRole("button")).toHaveLength(
            SETTINGS_SECTIONS.length,
        );
    });

    it("arrows move through visible sections only", async () => {
        render(<Harness />);
        fireEvent.change(await search(), { target: { value: "file" } });
        const names = within(nav())
            .getAllByRole("button")
            .map((b) => b.textContent!);
        expect(names.length).toBeGreaterThan(1);
        expect(names.length).toBeLessThan(SETTINGS_SECTIONS.length);
        const first = within(nav()).getByRole("button", { name: names[0] });
        first.focus();
        fireEvent.keyDown(first, { key: "ArrowDown" });
        expect(
            within(nav()).getByRole("button", { name: names[1] }),
        ).toHaveFocus();
        fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
        fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
        expect(
            within(nav()).getByRole("button", {
                name: names[names.length - 1],
            }),
        ).toHaveFocus();
    });

    it("marks the selected section with aria-current", async () => {
        render(<Harness initial="privacy" />);
        await search();
        expect(
            within(nav()).getByRole("button", { name: "Privacy" }),
        ).toHaveAttribute("aria-current", "page");
        expect(
            within(nav()).getByRole("button", { name: "General" }),
        ).not.toHaveAttribute("aria-current");
    });
});
