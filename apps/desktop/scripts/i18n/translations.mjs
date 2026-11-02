/**
 * Checks the translated language files against English: a translation must use the same
 * arguments and tags as the English text, in a compatible way, or it renders wrong ("invalid",
 * a raw id, a lost keycap). Keys English no longer has are ignored; Tolgee drops them later.
 * See docs/conventions/localization.md ("Changing a key").
 */
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

/** How an argument is used: "plain" `{a}`, "number" (`{a, number}`, plural, `#`), "select", "date". */
function collect(elements, into = { args: new Map(), tags: new Set() }) {
    const use = (name, kind) => {
        const before = into.args.get(name);
        // A number used plainly somewhere else is still a number.
        if (!before || before === "plain") into.args.set(name, kind);
    };
    for (const element of elements) {
        switch (element.type) {
            case TYPE.argument:
                use(element.value, "plain");
                break;
            case TYPE.number:
                use(element.value, "number");
                break;
            case TYPE.date:
            case TYPE.time:
                use(element.value, "date");
                break;
            case TYPE.plural:
                use(element.value, "number");
                for (const option of Object.values(element.options))
                    collect(option.value, into);
                break;
            case TYPE.select:
                use(element.value, "select");
                for (const option of Object.values(element.options))
                    collect(option.value, into);
                break;
            case TYPE.tag:
                into.tags.add(element.value);
                collect(element.children, into);
                break;
        }
    }
    return into;
}

export function messageShape(message) {
    return collect(parse(message, { ignoreTag: false }));
}

/**
 * Problems with one translation, as short phrases; empty when it renders like English does.
 * A plain `{a}` where English formats a number is fine (languages without plurals do that).
 */
export function translationProblems(english, translated) {
    let want;
    try {
        want = messageShape(english);
    } catch {
        return []; // English itself is broken; the English checks report that.
    }
    let have;
    try {
        have = messageShape(translated);
    } catch (error) {
        return [`doesn't parse (${error.message})`];
    }
    const problems = [];
    for (const [name, kind] of have.args) {
        const english = want.args.get(name);
        if (english === undefined) {
            problems.push(`uses {${name}}, which English doesn't have`);
        } else if (english === "select" && kind !== "select") {
            problems.push(
                `shows {${name}} as is, but English chooses words by it (select)`,
            );
        } else if (kind === "select" && english !== "select") {
            problems.push(`selects on {${name}}, which English doesn't`);
        }
    }
    for (const tag of want.tags) {
        if (!have.tags.has(tag)) problems.push(`lacks the <${tag}> tag`);
    }
    for (const tag of have.tags) {
        if (!want.tags.has(tag))
            problems.push(`has a <${tag}> tag English doesn't have`);
    }
    return problems;
}

/** Errors for every translated language file; `languages` maps a code to its flat messages. */
export function checkTranslations(english, languages) {
    const errors = [];
    for (const [language, messages] of Object.entries(languages)) {
        for (const [key, translated] of Object.entries(messages)) {
            if (!(key in english)) continue;
            for (const problem of translationProblems(
                english[key],
                translated,
            )) {
                errors.push(`  i18n/${language}.json ${key}: ${problem}`);
            }
        }
    }
    return errors;
}
