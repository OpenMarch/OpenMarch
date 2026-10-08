import { describe, expect, it } from "vitest";
import { Tolgee, FormatSimple } from "@tolgee/react";
import { FormatIcu } from "@tolgee/format-icu";
import { CachedFormatIcu } from "../cachedFormatIcu";

const messages = {
    plain: "Slot",
    member: "Slot {slot}: {marcher}",
    plural: "{count, plural, one {# marcher} other {# marchers}}",
    select: "{kind, select, home {Home} other {Page {n}}}",
    number: "{value, number} beats",
    tag: "Press <b>{key}</b>",
};

const make = async (plugin: ReturnType<typeof FormatIcu>) => {
    const tolgee = Tolgee()
        .use(FormatSimple())
        .use(plugin)
        .init({ language: "en", staticData: { en: messages } });
    await tolgee.run();
    return tolgee;
};

describe("CachedFormatIcu", () => {
    it("formats exactly as FormatIcu, again and again, with params changing", async () => {
        const icu = await make(FormatIcu());
        const cached = await make(CachedFormatIcu(4));
        const calls: [keyof typeof messages, Record<string, unknown>?][] = [
            ["plain"],
            ["member", { slot: 3, marcher: "B4" }],
            ["member", { slot: 3, marcher: "B4" }],
            ["member", { slot: 4, marcher: "B4" }],
            ["member", { marcher: "B4", slot: 3 }],
            ["member", { slot: "3", marcher: "B4" }],
            ["plural", { count: 1 }],
            ["plural", { count: 2 }],
            ["plural", { count: 1 }],
            ["select", { kind: "home", n: 1 }],
            ["select", { kind: "page", n: 7 }],
            ["number", { value: 1234.5 }],
            ["number", { value: 1234.5 }],
        ];
        // twice over, past the cache size, so entries are evicted and reused
        for (let round = 0; round < 2; round++)
            for (const [key, params] of calls)
                expect(cached.t(key, params as never)).toBe(
                    icu.t(key, params as never),
                );
    });

    it("leaves tag functions to the formatter every time", async () => {
        const icu = await make(FormatIcu());
        const cached = await make(CachedFormatIcu());
        let calls = 0;
        const b = (chunks: unknown) => {
            calls++;
            return `[${String(chunks)}]`;
        };
        const first = cached.t("tag", { key: "G", b } as never);
        const second = cached.t("tag", { key: "G", b } as never);
        expect(first).toEqual(icu.t("tag", { key: "G", b } as never));
        expect(second).toEqual(first);
        expect(calls).toBe(3);
    });

    it("keys the cache by language", async () => {
        const tolgee = Tolgee()
            .use(FormatSimple())
            .use(CachedFormatIcu())
            .init({
                language: "en",
                staticData: {
                    en: { n: "{v, number}" },
                    de: { n: "{v, number}" },
                },
            });
        await tolgee.run();
        expect(tolgee.t("n", { v: 1234.5 })).toBe("1,234.5");
        await tolgee.changeLanguage("de");
        expect(tolgee.t("n", { v: 1234.5 })).toBe("1.234,5");
    });
});
