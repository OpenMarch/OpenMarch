/**
 * ESLint rules behind `pnpm check:i18n`. They run only from `check-i18n.mjs`, not from the
 * repository's ESLint config, so the opt-out is an `i18n-ignore: <reason>` comment rather than an
 * `eslint-disable` directive.
 */

const LETTER = /\p{L}/u;

/** Props whose string value is shown to the user or read out by a screen reader. */
const TEXT_PROP =
    /^(title|alt|label|placeholder|tooltip|description|heading|subtitle|message|text)$|^aria-(label|description|valuetext|roledescription)$|[a-z](Label|Text|Title|Tooltip|Description|Message)$/;

/** `content` is text on tooltips, but a layout variant ("icon", "text") on buttons. */
const isTextProp = (name, element) =>
    TEXT_PROP.test(name) ||
    (name === "content" && !/Button$/.test(element ?? ""));

/** Option fields of toast calls that hold text. */
const TOAST_TEXT_OPTIONS = new Set([
    "description",
    "loading",
    "success",
    "error",
    "label",
]);

/** Elements whose text is code or markup, not prose. */
const NON_PROSE_ELEMENTS = new Set(["code", "pre", "style", "script"]);

/** Calls whose first argument is a message shown to the user. */
const MESSAGE_CALLS = new Set(["conToastError", "alert", "confirm"]);

/** `i18n-ignore: <reason>`; the reason is required. */
const IGNORE_MARKER = /\bi18n-ignore:\s*\S/;

const hasLetter = (text) => LETTER.test(text);

/** The string literals in an expression that would reach the screen as written. */
function literalText(node) {
    if (!node) return [];
    switch (node.type) {
        case "Literal":
            return typeof node.value === "string" && hasLetter(node.value)
                ? [node]
                : [];
        case "TemplateLiteral":
            return node.quasis.some((quasi) =>
                hasLetter(quasi.value.cooked ?? quasi.value.raw),
            )
                ? [node]
                : [];
        case "ConditionalExpression":
            return [
                ...literalText(node.consequent),
                ...literalText(node.alternate),
            ];
        case "BinaryExpression":
            return node.operator === "+"
                ? [...literalText(node.left), ...literalText(node.right)]
                : [];
        case "LogicalExpression":
            return node.operator === "&&"
                ? literalText(node.right)
                : [...literalText(node.left), ...literalText(node.right)];
        case "JSXExpressionContainer":
            return literalText(node.expression);
        case "TSAsExpression":
        case "TSSatisfiesExpression":
            return literalText(node.expression);
        default:
            return [];
    }
}

function elementName(node) {
    const name = node?.openingElement?.name;
    return name?.type === "JSXIdentifier" ? name.name : undefined;
}

function calleeName(callee) {
    if (callee.type === "Identifier") return callee.name;
    if (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.property.type === "Identifier"
    ) {
        return `${callee.object.name}.${callee.property.name}`;
    }
    return undefined;
}

function isMessageCall(name) {
    if (!name) return false;
    return (
        name === "toast" ||
        name.startsWith("toast.") ||
        MESSAGE_CALLS.has(name) ||
        name === "window.alert" ||
        name === "window.confirm"
    );
}

/** Tokens between an ignore comment and the code it's about: `{/* *\/}` braces, JSX whitespace. */
const isFiller = (token) =>
    (token?.type === "Punctuator" &&
        (token.value === "{" || token.value === "}")) ||
    (token?.type === "JSXText" && token.value.trim() === "");

function skipFiller(sourceCode, from, step) {
    let token = step(from);
    while (token && isFiller(token)) token = step(token);
    return token;
}

/**
 * What an `i18n-ignore: <reason>` comment covers. A comment after code on the same line
 * covers that line. Otherwise it covers the next statement, JSX element or attribute,
 * however many lines that spans (`{/* ... *\/}` braces around the comment are skipped).
 * Returns a test for a node.
 */
function ignoreScope(sourceCode) {
    const lines = new Set();
    const ranges = [];
    for (const comment of sourceCode.getAllComments()) {
        if (!IGNORE_MARKER.test(comment.value)) continue;
        const before = skipFiller(sourceCode, comment, (t) =>
            sourceCode.getTokenBefore(t, { includeComments: false }),
        );
        if (before && before.loc.end.line === comment.loc.start.line) {
            lines.add(comment.loc.start.line);
            continue;
        }
        const after = skipFiller(sourceCode, comment, (t) =>
            sourceCode.getTokenAfter(t, { includeComments: false }),
        );
        if (!after) continue;
        let node = sourceCode.getNodeByRangeIndex(after.range[0]);
        while (
            node?.parent &&
            node.parent.type !== "Program" &&
            node.parent.range[0] === node.range[0]
        ) {
            node = node.parent;
        }
        if (node) ranges.push([after.range[0], node.range[1]]);
    }
    return (node) =>
        lines.has(node.loc.start.line) ||
        ranges.some(
            ([from, to]) => node.range[0] >= from && node.range[0] < to,
        );
}

export const noUntranslatedText = {
    meta: {
        type: "problem",
        messages: {
            text: "Untranslated UI text: {{text}}",
        },
        schema: [],
    },
    create(context) {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const ignored = ignoreScope(sourceCode);

        const report = (node) => {
            if (ignored(node)) return;
            const raw = sourceCode.getText(node).trim().replace(/\s+/g, " ");
            const text = raw.length > 60 ? `${raw.slice(0, 57)}...` : raw;
            context.report({ node, messageId: "text", data: { text } });
        };

        return {
            JSXText(node) {
                if (!hasLetter(node.value)) return;
                if (NON_PROSE_ELEMENTS.has(elementName(node.parent))) return;
                report(node);
            },
            JSXExpressionContainer(node) {
                const parent = node.parent;
                if (
                    parent.type !== "JSXElement" &&
                    parent.type !== "JSXFragment"
                )
                    return;
                if (NON_PROSE_ELEMENTS.has(elementName(parent))) return;
                literalText(node.expression).forEach(report);
            },
            JSXAttribute(node) {
                if (node.name.type !== "JSXIdentifier") return;
                const element = node.parent.name;
                const elementName =
                    element.type === "JSXIdentifier" ? element.name : undefined;
                if (!isTextProp(node.name.name, elementName)) return;
                literalText(node.value).forEach(report);
            },
            CallExpression(node) {
                const name = calleeName(node.callee);
                if (!isMessageCall(name)) return;
                literalText(node.arguments[0]).forEach(report);
                if (!name.startsWith("toast")) return;
                for (const argument of node.arguments) {
                    if (argument.type !== "ObjectExpression") continue;
                    for (const property of argument.properties) {
                        if (
                            property.type === "Property" &&
                            !property.computed &&
                            property.key.type === "Identifier" &&
                            TOAST_TEXT_OPTIONS.has(property.key.name)
                        ) {
                            literalText(property.value).forEach(report);
                        }
                    }
                }
            },
        };
    },
};

/** The value of a string literal, or of a template literal with no `${}`. */
function staticString(node) {
    if (node?.type === "Literal" && typeof node.value === "string")
        return node.value;
    if (node?.type === "TemplateLiteral" && node.expressions.length === 0)
        return node.quasis[0].value.cooked ?? undefined;
    return undefined;
}

/** The literal key and inline default of a Tolgee `t(...)` call or `<T keyName>`. */
function translationCall(node) {
    const callee = node.callee;
    const isT =
        (callee.type === "Identifier" && callee.name === "t") ||
        (callee.type === "MemberExpression" &&
            !callee.computed &&
            callee.property.type === "Identifier" &&
            callee.property.name === "t");
    if (!isT) return undefined;
    const [first, second] = node.arguments;
    const key = staticString(first);
    if (key !== undefined) {
        const fallback =
            staticString(second) ?? objectString(second, "defaultValue");
        return { keyNode: first, key, fallback };
    }
    const keyNode = objectProperty(first, "key");
    const objectKey = staticString(keyNode);
    if (objectKey !== undefined) {
        return {
            keyNode,
            key: objectKey,
            fallback: objectString(first, "defaultValue"),
        };
    }
    return undefined;
}

function objectProperty(node, name) {
    if (node?.type !== "ObjectExpression") return undefined;
    const property = node.properties.find(
        (p) =>
            p.type === "Property" &&
            !p.computed &&
            ((p.key.type === "Identifier" && p.key.name === name) ||
                (p.key.type === "Literal" && p.key.value === name)),
    );
    return property?.value;
}

function objectString(node, name) {
    return staticString(objectProperty(node, name));
}

function jsxAttribute(opening, name) {
    return opening.attributes.find(
        (a) =>
            a.type === "JSXAttribute" &&
            a.name.type === "JSXIdentifier" &&
            a.name.name === name,
    );
}

function jsxString(attribute) {
    let node = attribute?.value;
    if (node?.type === "JSXExpressionContainer") node = node.expression;
    const value = staticString(node);
    return value === undefined ? undefined : { node, value };
}

/**
 * Properties that hold a translation key for code elsewhere to translate (`labelKey:
 * "menu.file.open"`), so their literal values are checked like `t()` keys.
 */
const KEY_PROP =
    /^(label|title|message|description|detail|tooltip|placeholder)Key$/;

/**
 * Every literal key passed to Tolgee, or written in a `labelKey`-style property, exists in
 * `en.json`, and an inline default matches the English there. Option:
 * `{ english: Record<flatKey, string> }`.
 */
export const knownTranslationKey = {
    meta: {
        type: "problem",
        messages: {
            missing:
                'Key "{{key}}" is not in i18n/en.json, so translators never see it. Add it with its English text.',
            drift: `The inline default for "{{key}}" differs from i18n/en.json ("{{english}}"). Change both together.`,
        },
        schema: [{ type: "object" }],
    },
    create(context) {
        const english = context.options[0]?.english ?? {};
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const ignored = ignoreScope(sourceCode);

        const check = (keyNode, key, fallback) => {
            if (ignored(keyNode)) return;
            if (!(key in english)) {
                context.report({
                    node: keyNode,
                    messageId: "missing",
                    data: { key },
                });
            } else if (fallback !== undefined && fallback !== english[key]) {
                context.report({
                    node: keyNode,
                    messageId: "drift",
                    data: { key, english: english[key] },
                });
            }
        };

        return {
            CallExpression(node) {
                const call = translationCall(node);
                if (call) check(call.keyNode, call.key, call.fallback);
            },
            Property(node) {
                if (node.computed || node.parent.type !== "ObjectExpression")
                    return;
                const name =
                    node.key.type === "Identifier"
                        ? node.key.name
                        : node.key.type === "Literal"
                          ? node.key.value
                          : undefined;
                if (typeof name !== "string" || !KEY_PROP.test(name)) return;
                const key = staticString(node.value);
                // An empty key means "no key" (the text comes from elsewhere)
                if (key) check(node.value, key, undefined);
            },
            JSXOpeningElement(node) {
                if (
                    node.name.type !== "JSXIdentifier" ||
                    node.name.name !== "T"
                )
                    return;
                const key = jsxString(jsxAttribute(node, "keyName"));
                if (!key) return;
                const fallback = jsxString(jsxAttribute(node, "defaultValue"));
                check(key.node, key.value, fallback?.value);
            },
        };
    },
};

/** Options of Electron's native dialogs that are shown as text. */
const DIALOG_TEXT_OPTIONS = new Set([
    "title",
    "message",
    "detail",
    "buttonLabel",
    "checkboxLabel",
    "nameFieldLabel",
    "prompt",
]);

/** `dialog.showMessageBox` and the other `dialog.show*` calls. */
const isDialogCall = (name) => /^dialog\.show[A-Z]\w*$/.test(name ?? "");

/** An object literal shaped like an Electron menu item. */
const isMenuItem = (object) =>
    object.properties.some(
        (p) =>
            p.type === "Property" &&
            !p.computed &&
            p.key.type === "Identifier" &&
            ["click", "role", "submenu", "accelerator"].includes(p.key.name),
    );

function propertyName(property) {
    if (property.type !== "Property" || property.computed) return undefined;
    if (property.key.type === "Identifier") return property.key.name;
    if (property.key.type === "Literal") return String(property.key.value);
    return undefined;
}

/**
 * Reports the `role` of a menu item that has no `label`. A role item shows
 * Electron's own label, which is English in every language, so it needs a label of its own. No
 * role is exempt: Electron localizes none of them, and every role that makes a menu item shows
 * text. A spread may bring the label, so an item with one isn't flagged.
 */
function reportUnlabelledRole(context, object, ignored) {
    const role = object.properties.find((p) => propertyName(p) === "role");
    if (!role || ignored(role)) return;
    const labelled = object.properties.some(
        (p) => p.type === "SpreadElement" || propertyName(p) === "label",
    );
    if (labelled) return;
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    context.report({
        node: role,
        messageId: "roleLabel",
        data: { role: sourceCode.getText(role.value).replace(/\s+/g, " ") },
    });
}

/**
 * The main process's literal UI text (`apps/desktop/electron`): native dialogs' text options,
 * their button labels and file-filter names, menu item labels, and window titles. JSX text
 * doesn't exist there, so `no-untranslated-text` would find nothing.
 */
export const noUntranslatedMainText = {
    meta: {
        type: "problem",
        messages: {
            text: "Untranslated UI text: {{text}}",
            roleLabel:
                "Untranslated UI text: menu item {{role}} has no label. Electron's role labels are English only; add label: t(…)",
        },
        schema: [],
    },
    create(context) {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const ignored = ignoreScope(sourceCode);

        const report = (node) => {
            if (ignored(node)) return;
            const raw = sourceCode.getText(node).trim().replace(/\s+/g, " ");
            const text = raw.length > 60 ? `${raw.slice(0, 57)}...` : raw;
            context.report({ node, messageId: "text", data: { text } });
        };

        /** The text options of a dialog's options object. */
        const dialogOptions = (object) => {
            if (object?.type !== "ObjectExpression") return;
            for (const property of object.properties) {
                const name = propertyName(property);
                if (DIALOG_TEXT_OPTIONS.has(name)) {
                    literalText(property.value).forEach(report);
                } else if (
                    name === "buttons" &&
                    property.value.type === "ArrayExpression"
                ) {
                    property.value.elements.forEach((e) =>
                        literalText(e).forEach(report),
                    );
                } else if (
                    name === "filters" &&
                    property.value.type === "ArrayExpression"
                ) {
                    for (const filter of property.value.elements) {
                        if (filter?.type !== "ObjectExpression") continue;
                        for (const p of filter.properties) {
                            if (propertyName(p) === "name")
                                literalText(p.value).forEach(report);
                        }
                    }
                }
            }
        };

        return {
            CallExpression(node) {
                const name = calleeName(node.callee);
                if (name === "dialog.showErrorBox") {
                    node.arguments.forEach((a) =>
                        literalText(a).forEach(report),
                    );
                } else if (isDialogCall(name)) {
                    node.arguments.forEach(dialogOptions);
                } else if (
                    node.callee.type === "MemberExpression" &&
                    !node.callee.computed &&
                    node.callee.property.type === "Identifier" &&
                    node.callee.property.name === "setTitle"
                ) {
                    literalText(node.arguments[0]).forEach(report);
                }
            },
            NewExpression(node) {
                if (
                    node.callee.type !== "Identifier" ||
                    node.callee.name !== "BrowserWindow"
                )
                    return;
                const options = node.arguments[0];
                if (options?.type !== "ObjectExpression") return;
                for (const property of options.properties) {
                    if (propertyName(property) === "title")
                        literalText(property.value).forEach(report);
                }
            },
            ObjectExpression(node) {
                if (!isMenuItem(node)) return;
                for (const property of node.properties) {
                    if (propertyName(property) === "label")
                        literalText(property.value).forEach(report);
                }
                reportUnlabelledRole(context, node, ignored);
            },
        };
    },
};
