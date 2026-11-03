import { fireEvent, render, screen } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import TranslationHelpNote, {
    HELP_TRANSLATE_URL,
} from "../TranslationHelpNote";

beforeAll(async () => {
    await tolgee.run();
});

const openExternal = vi.fn();
beforeEach(() => {
    openExternal.mockReset();
    Object.assign(window, { electron: { openExternal } });
});

function renderNote(language: string) {
    return render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <TranslationHelpNote language={language} />
        </TolgeeProvider>,
    );
}

describe("TranslationHelpNote", () => {
    it("invites English users to add their language", async () => {
        renderNote("en");
        const link = await screen.findByRole("button", {
            name: "Help us add it",
        });
        expect(screen.getByTestId("translation-help-note").textContent).toMatch(
            /Don't see your language\?/,
        );
        fireEvent.click(link);
        expect(openExternal).toHaveBeenCalledWith(HELP_TRANSLATE_URL);
    });

    it("says another language was translated with AI and asks for help checking it", async () => {
        renderNote("ja");
        const link = await screen.findByRole("button", {
            name: "Help us check it",
        });
        expect(screen.getByTestId("translation-help-note").textContent).toMatch(
            /made with AI/,
        );
        fireEvent.click(link);
        expect(openExternal).toHaveBeenCalledWith(HELP_TRANSLATE_URL);
    });
});
