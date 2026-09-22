/**
 * Binding strings are human-editable: "$mod+Shift+Z", "Alt+V", "Space", "ArrowUp", "1".
 * `$mod` is Cmd on macOS and Ctrl elsewhere.
 */
export type Modifier = "$mod" | "Control" | "Meta" | "Alt" | "Shift";

export interface ParsedBinding {
    modifiers: Modifier[];
    key: string;
}

const MODIFIER_ORDER: readonly Modifier[] = [
    "$mod",
    "Control",
    "Meta",
    "Alt",
    "Shift",
];

const MODIFIER_ALIASES: Record<string, Modifier> = {
    $mod: "$mod",
    mod: "$mod",
    control: "Control",
    ctrl: "Control",
    meta: "Meta",
    cmd: "Meta",
    command: "Meta",
    alt: "Alt",
    option: "Alt",
    shift: "Shift",
};

/* cspell: disable */
const KEY_ALIASES: Record<string, string> = {
    space: "Space",
    esc: "Escape",
    escape: "Escape",
    enter: "Enter",
    return: "Enter",
    del: "Delete",
    delete: "Delete",
    backspace: "Backspace",
    tab: "Tab",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
};
/* cspell: enable */

function canonicalKey(raw: string): string {
    const alias = KEY_ALIASES[raw.toLowerCase()];
    if (alias) return alias;
    if (/^[a-z]$/i.test(raw)) return raw.toUpperCase();
    if (/^f\d{1,2}$/i.test(raw)) return raw.toUpperCase();
    return raw;
}

export function parseBinding(binding: string): ParsedBinding {
    const parts = binding.split("+").map((part) => part.trim());
    if (parts.some((part) => part === "")) {
        throw new Error(`Invalid binding "${binding}"`);
    }
    const key = canonicalKey(parts.pop()!);
    const modifiers = parts.map((part) => {
        const modifier = MODIFIER_ALIASES[part.toLowerCase()];
        if (!modifier) {
            throw new Error(`Unknown modifier "${part}" in "${binding}"`);
        }
        return modifier;
    });
    const unique = [...new Set(modifiers)].sort(
        (a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b),
    );
    return { modifiers: unique, key };
}

export function canonicalBinding(binding: string): string {
    const { modifiers, key } = parseBinding(binding);
    return [...modifiers, key].join("+");
}

const MODIFIER_KEY_NAMES = new Set([
    "Shift",
    "Control",
    "Alt",
    "AltGraph",
    "Meta",
    "OS",
    "Fn",
    "CapsLock",
]);

type KeyPress = Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

function keyFromEvent({ key, code }: KeyPress): string {
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter) return letter[1];
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (digit) return digit[1];
    if (code === "Space" || key === " ") return "Space";
    // Punctuation uses event.code ("Slash", "Equal"): event.key varies by layout and "+" is the separator.
    if (key.length === 1) return code;
    return key;
}

/**
 * Turns a key press into a portable binding string, or undefined for a bare modifier press.
 * Cmd on macOS and Ctrl elsewhere are recorded as `$mod`.
 */
export function bindingFromEvent(
    event: KeyPress,
    isMac: boolean,
): string | undefined {
    if (MODIFIER_KEY_NAMES.has(event.key) || !event.code) return undefined;
    const modifiers: string[] = [];
    if (event.ctrlKey) modifiers.push(isMac ? "Control" : "$mod");
    if (event.metaKey) modifiers.push(isMac ? "$mod" : "Meta");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey) modifiers.push("Shift");
    return canonicalBinding([...modifiers, keyFromEvent(event)].join("+"));
}

/** Canonical binding with `$mod` resolved to the platform's modifier, so equal key presses compare equal. */
export function platformBinding(binding: string, isMac: boolean): string {
    const { modifiers, key } = parseBinding(binding);
    const resolved = modifiers.map((m) =>
        m === "$mod" ? (isMac ? "Meta" : "Control") : m,
    );
    return canonicalBinding([...resolved, key].join("+"));
}

/* cspell: disable-next-line */
/**
 * Converts to tinykeys syntax. Letters/digits match on event.code so macOS Option doesn't break them;
 * digits also match the numpad, as the old handler did.
 */
/* cspell: disable-next-line */
export function toTinykeys(binding: string): string {
    const { modifiers, key } = parseBinding(binding);
    let tinyKey = key;
    if (/^[A-Z]$/.test(key)) tinyKey = `Key${key}`;
    else if (/^\d$/.test(key)) tinyKey = `(Digit${key}|Numpad${key})`;
    return [...modifiers, tinyKey].join("+");
}

const MAC_MODIFIER_SYMBOLS: Record<Modifier, string> = {
    Control: "⌃",
    Alt: "⌥",
    Shift: "⇧",
    $mod: "⌘",
    Meta: "⌘",
};
const MAC_SYMBOL_ORDER: readonly Modifier[] = [
    "Control",
    "Alt",
    "Shift",
    "$mod",
    "Meta",
];
const OTHER_MODIFIER_NAMES: Record<Modifier, string> = {
    $mod: "Ctrl",
    Control: "Ctrl",
    Meta: "Win",
    Alt: "Alt",
    Shift: "Shift",
};

const ARROWS: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
};

/* cspell: disable */
const PUNCTUATION: Record<string, string> = {
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
};
/* cspell: enable */

function formatKey(key: string, isMac: boolean): string {
    if (ARROWS[key]) return ARROWS[key];
    if (PUNCTUATION[key]) return PUNCTUATION[key];
    if (key === "Escape") return "Esc";
    if (isMac && key === "Enter") return "↩";
    if (isMac && key === "Delete") return "⌦";
    if (isMac && key === "Backspace") return "⌫";
    if (!isMac && key === "Delete") return "Del";
    return key;
}

export function formatBinding(binding: string, isMac: boolean): string {
    const { modifiers, key } = parseBinding(binding);
    if (isMac) {
        const symbols = MAC_SYMBOL_ORDER.filter((m) => modifiers.includes(m))
            .map((m) => MAC_MODIFIER_SYMBOLS[m])
            .join("");
        return `${symbols}${formatKey(key, true)}`;
    }
    return [
        ...modifiers.map((m) => OTHER_MODIFIER_NAMES[m]),
        formatKey(key, false),
    ].join("+");
}
