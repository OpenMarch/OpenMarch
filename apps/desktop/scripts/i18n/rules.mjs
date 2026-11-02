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
 * Every literal key passed to Tolgee exists in `en.json`, and an inline default matches the
 * English there. Option: `{ english: Record<flatKey, string> }`.
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
