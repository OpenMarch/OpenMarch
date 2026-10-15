import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import {
    TEMPLATE_DOWNLOADS,
    templateDownloadSurface,
} from "@/view3d/core/artworkTemplates/downloads";
import type { Result, TemplateSaveRequest } from "@/view3d/library/protocol";
import ArtworkTemplatesMenu, {
    MENU_FORMATS,
    templateSizeText,
} from "../ArtworkTemplatesMenu";

// jsdom has no ResizeObserver; Radix's popper measures with one.
class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

beforeAll(async () => {
    globalThis.ResizeObserver ??=
        NoopResizeObserver as unknown as typeof ResizeObserver;
    await tolgee.run();
});

afterEach(() => cleanup());

function renderMenu(
    answer: Result<{ filename: string } | null> = {
        ok: true,
        value: { filename: "saved.pdf" },
    },
) {
    const calls: TemplateSaveRequest[] = [];
    const client = {
        saveTemplate: async (request: TemplateSaveRequest) => {
            calls.push(request);
            return answer;
        },
    };
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <ArtworkTemplatesMenu client={client} />
        </TolgeeProvider>,
    );
    return calls;
}

async function openGroup(
    user: ReturnType<typeof userEvent.setup>,
    group: string,
) {
    await user.click(screen.getByTestId("artwork-templates-menu"));
    const trigger = await screen.findByTestId(
        `artwork-templates-group-${group}`,
    );
    trigger.focus();
    await user.keyboard("{ArrowRight}");
}

describe("ArtworkTemplatesMenu", () => {
    it("lists the five surface groups", async () => {
        const user = userEvent.setup();
        renderMenu();
        await user.click(screen.getByTestId("artwork-templates-menu"));
        for (const name of [
            "Silk Cuts",
            "Base floors",
            "Floor props",
            "Prop panels",
            "Uniform panels",
        ]) {
            expect(await screen.findByText(name)).toBeInTheDocument();
        }
    });

    it("saves the picked silk variant in the picked format, one per click", async () => {
        const user = userEvent.setup();
        const calls = renderMenu();
        await openGroup(user, "silk");
        expect(
            await screen.findByRole("group", {
                name: "Swing, sagging bottom",
            }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole("menuitem", {
                name: "Download 6 ft pole silk, 9 in sag as PDF",
            }),
        );
        await waitFor(() =>
            expect(calls).toEqual([
                { surfaceId: "silk-6ft-36x54-sag-9in", format: "pdf" },
            ]),
        );
    });

    it("offers PNG, SVG and PDF for every template in a group", async () => {
        const user = userEvent.setup();
        renderMenu();
        await openGroup(user, "uniform");
        const rows = await screen.findAllByRole("group");
        const uniform = TEMPLATE_DOWNLOADS.filter((d) => d.group === "uniform");
        expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
            "Top, front",
            "Top, back",
            "Bottoms, front",
            "Bottoms, back",
            "Overlay (cape), back",
        ]);
        expect(rows.map((r) => r.dataset.surface)).toEqual(
            uniform.map((d) => d.surface.id),
        );
        for (const row of rows) {
            expect(
                [...row.querySelectorAll('[role="menuitem"]')].map(
                    (item) => item.textContent,
                ),
            ).toEqual(MENU_FORMATS.map((f) => f.toUpperCase()));
        }
    });

    it("names the prop faces and the Floor prop's sheet size", async () => {
        const user = userEvent.setup();
        const calls = renderMenu({ ok: true, value: null });
        await openGroup(user, "prop");
        await user.click(
            await screen.findByRole("menuitem", {
                name: "Download Top, 4 x 8 ft sheet as SVG",
            }),
        );
        await waitFor(() =>
            expect(calls).toEqual([
                { surfaceId: "prop-top-4x8ft", format: "svg" },
            ]),
        );
    });

    it("shows sizes in the template's own unit", () => {
        const size = (id: string) =>
            templateSizeText(
                TEMPLATE_DOWNLOADS.find((d) => d.surface.id === id)!,
            );
        expect(templateDownloadSurface("silk-6ft-36x54")).toBeDefined();
        expect(size("silk-6ft-36x54")).toBe("54 in × 36 in");
        expect(size("base-floor-wgi-minimum-60x90ft")).toBe("90 ft × 60 ft");
        expect(size("uniform-top-front")).toBe("0.46 m × 0.57 m");
    });
});
