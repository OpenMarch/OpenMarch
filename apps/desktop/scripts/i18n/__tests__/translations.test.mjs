import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTranslations, translationProblems } from "../translations.mjs";

test("a translation with the same arguments and tags fits", () => {
    assert.deepEqual(
        translationProblems(
            "{count, plural, one {# marcher} other {# marchers}} on <keys></keys>",
            "{count, plural, one {# marcheur} other {# marcheurs}} sur <keys></keys>",
        ),
        [],
    );
});

test("a plain argument where English formats a number fits (no plurals in the language)", () => {
    assert.deepEqual(
        translationProblems(
            "{count, plural, one {# shape} other {# shapes}}",
            "{count} 個の図形",
        ),
        [],
    );
});

test("an argument English no longer passes renders 'invalid'", () => {
    assert.deepEqual(
        translationProblems(
            "<keys></keys> is already used by {actions}.",
            "{binding} est déjà utilisé par {actions}.",
        ),
        ["uses {binding}, which English doesn't have", "lacks the <keys> tag"],
    );
});

test("showing a select argument as is prints the raw id", () => {
    assert.deepEqual(
        translationProblems(
            "Select the whole {shape, select, block {box} other {shape}}",
            "Seleccionar {shape}",
        ),
        ["shows {shape} as is, but English chooses words by it (select)"],
    );
});

test("a translation that doesn't parse is reported", () => {
    const [problem] = translationProblems("Set {count}", "Défini {{count}}");
    assert.match(problem, /^doesn't parse/);
});

test("keys English no longer has are skipped", () => {
    assert.deepEqual(
        checkTranslations(
            { "a.b": "Hello {name}" },
            { fr: { "a.b": "Bonjour {name}", "a.gone": "{whatever}" } },
        ),
        [],
    );
});

test("errors name the language file and key", () => {
    assert.deepEqual(
        checkTranslations(
            { "a.b": "Hello {name}" },
            { "pt-BR": { "a.b": "Olá {nome}" } },
        ),
        ["  i18n/pt-BR.json a.b: uses {nome}, which English doesn't have"],
    );
});
