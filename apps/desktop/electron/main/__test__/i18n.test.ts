// @vitest-environment node
// cspell:words Paramètres Créer Marcheurs
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    getMainLanguage,
    onMainLanguageChange,
    setMainLanguage,
    t,
    toMainLanguage,
} from "../i18n";

afterEach(() => {
    setMainLanguage("en");
});

describe("main-process translations", () => {
    it("shows English until a language is set", () => {
        expect(getMainLanguage()).toBe("en");
        expect(t("menu.file.open")).toBe("Open File");
    });

    it("fills ICU arguments and plurals", () => {
        expect(t("menu.app.about", { appName: "OpenMarch" })).toBe(
            "About OpenMarch",
        );
        expect(t("mobileExport.date.daysAgo", { count: 1 })).toBe("1 day ago");
        expect(t("mobileExport.date.daysAgo", { count: 3 })).toBe("3 days ago");
        expect(
            t("menu.withShortcut", { label: "Play / Stop", shortcut: "Space" }),
        ).toBe("Play / Stop  (Space)");
    });

    it("follows the app language, with its plural rules", () => {
        expect(setMainLanguage("fr")).toBe(true);
        expect(t("settings.title")).toBe("Paramètres");
        expect(t("mobileExport.date.daysAgo", { count: 2 })).toBe(
            // cspell:disable-next-line
            "il y a 2 jours",
        );
        setMainLanguage("ja");
        expect(t("settings.title")).toBe("設定");
    });

    it("treats an unknown or missing setting as English", () => {
        expect(toMainLanguage("pt-BR")).toBe("pt-BR");
        expect(toMainLanguage("de")).toBe("en");
        expect(toMainLanguage(undefined)).toBe("en");
        setMainLanguage("fr");
        setMainLanguage("klingon");
        expect(getMainLanguage()).toBe("en");
        expect(t("settings.title")).toBe("Settings");
    });

    it("tells listeners only when the language changes", () => {
        const listener = vi.fn();
        const stop = onMainLanguageChange(listener);
        expect(setMainLanguage("es")).toBe(true);
        expect(setMainLanguage("es")).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith("es");
        stop();
        setMainLanguage("en");
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
