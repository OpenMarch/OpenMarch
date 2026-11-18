import { describe, expect, it } from "vitest";
import { helpPrompt, languageName } from "../helpPrompt";

const base = {
    site: "https://openmarch.com",
    version: "0.2.0",
    app: "desktop",
    system: "Windows",
    mode: "Basic",
    language: null,
    question: "",
} as const;

describe("helpPrompt", () => {
    it("points the assistant at the guide's plain-text copies on this build's site", () => {
        const prompt = helpPrompt(base);
        expect(prompt).toContain("https://openmarch.com/llms.txt");
        expect(prompt).toContain("plus .md");
        expect(prompt).toContain("https://openmarch.com/llms-small.txt");
        expect(prompt).toContain(
            "https://openmarch.com/guides/start/get-help/",
        );
        expect(prompt).not.toContain("llms-full.txt");
    });

    it("says which version, app, system and mode the user has", () => {
        const prompt = helpPrompt({
            ...base,
            app: "web",
            system: "iPad",
            mode: "Expert",
        });
        expect(prompt).toContain(
            "My setup: OpenMarch 0.2.0, the web editor on iPad, in Expert mode.",
        );
    });

    it("passes on the user's question, before the instructions", () => {
        const prompt = helpPrompt({
            ...base,
            question: "  How do I make marchers stand still?  ",
        });
        expect(prompt).toContain(
            "My question: How do I make marchers stand still?",
        );
        expect(prompt.indexOf("My question:")).toBeLessThan(
            prompt.indexOf("--- The rest"),
        );
        expect(prompt).not.toContain("asking me what I need help with");
    });

    it("asks the assistant to find out what the user needs when the box is empty", () => {
        for (const question of ["", "   "]) {
            const prompt = helpPrompt({ ...base, question });
            expect(prompt).toContain("asking me what I need help with");
            expect(prompt).not.toContain("My question:");
        }
    });

    it("says the app's language only when it isn't English", () => {
        expect(helpPrompt(base)).not.toContain("My app is in");
        expect(helpPrompt({ ...base, language: "English" })).not.toContain(
            "My app is in",
        );
        expect(helpPrompt({ ...base, language: "Spanish" })).toContain(
            "My app is in Spanish; the guide's names are in English.",
        );
    });

    it("hands a likely bug to Submit bug or feedback, with Known issues checked first", () => {
        const prompt = helpPrompt(base);
        expect(prompt).toContain(
            "https://openmarch.com/troubleshooting/known-issues.md",
        );
        expect(prompt).toContain('"Submit bug or feedback"');
        expect(prompt).toContain("Don't ask for my show file.");
    });

    it("uses the preview site for a pre-release build", () => {
        const prompt = helpPrompt({
            ...base,
            site: "https://preview.openmarch.com",
        });
        expect(prompt).toContain("https://preview.openmarch.com/llms.txt");
        expect(prompt).not.toContain("https://openmarch.com/");
    });
});

describe("languageName", () => {
    it("names a language code in English", () => {
        expect(languageName("es")).toBe("Spanish");
        expect(languageName("en")).toBe("English");
        expect(languageName(undefined)).toBeNull();
    });
});
