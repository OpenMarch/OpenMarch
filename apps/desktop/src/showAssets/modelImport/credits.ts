// cspell:words xmp xmpRights dcterms sketchfab creativecommons publicdomain
/**
 * Credits prefilled from the file (fork #998, D-21), for the user to confirm on the review:
 *
 * 1. `KHR_xmp_json_ld`, the packet the asset names: `dc:rights`, `dc:creator`, `dc:source`, and a
 *    license URL in `xmpRights:WebStatement` or `cc:license`;
 * 2. then `asset.copyright`, kept as the attribution and searched for a license;
 * 3. then `asset.extras` as Sketchfab writes it (`author`, `license`, `source`), for fields still
 *    empty.
 *
 * Only Creative Commons and public-domain licenses are recognized; anything else leaves
 * `license` empty, which means Unknown.
 */
import type { RawGltf } from "./files";
import type { ModelCredits } from "./types";

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
    !!v && typeof v === "object" && !Array.isArray(v);

/** A JSON-LD value as plain text: a string, `@value`, the first of a list or language map. */
function text(value: unknown): string | null {
    if (typeof value === "string") return value.trim() || null;
    if (Array.isArray(value)) {
        const parts = value.map(text).filter((t): t is string => !!t);
        return parts.length ? parts.join(", ") : null;
    }
    if (!isObject(value)) return null;
    if ("@value" in value) return text(value["@value"]);
    if ("@id" in value) return text(value["@id"]);
    for (const key of ["@list", "@set", "rdf:Seq", "rdf:Bag", "rdf:Alt"])
        if (key in value) return text(value[key]);
    // A language map: { "en": "...", "x-default": "..." }
    const first = value["x-default"] ?? value.en ?? Object.values(value)[0];
    return first === undefined ? null : text(first);
}

/** The XMP packet the asset names, or null. */
function assetPacket(json: RawGltf): Json | null {
    const packets = (json.extensions as Json | undefined)?.KHR_xmp_json_ld as
        | { packets?: unknown }
        | undefined;
    const index = (
        (json.asset?.extensions as Json | undefined)?.KHR_xmp_json_ld as
            | { packet?: unknown }
            | undefined
    )?.packet;
    if (!Array.isArray(packets?.packets) || typeof index !== "number")
        return null;
    const packet: unknown = packets.packets[index];
    return isObject(packet) ? packet : null;
}

const CC_KINDS = ["by", "by-sa", "by-nd", "by-nc", "by-nc-sa", "by-nc-nd"];

/**
 * An SPDX id for a Creative Commons or public-domain license named by URL or text, such as
 * `CC-BY-4.0` for "https://creativecommons.org/licenses/by/4.0/" or "CC BY 4.0".
 */
export function spdxLicenseOf(value: string | null): string | null {
    if (!value) return null;
    const url = value.match(
        /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d\.\d)/i,
    );
    if (url) {
        const [, family, kind, version] = url;
        if (family.toLowerCase() === "publicdomain")
            return kind.toLowerCase() === "zero" ? `CC0-${version}` : null;
        return CC_KINDS.includes(kind.toLowerCase())
            ? `CC-${kind.toUpperCase()}-${version}`
            : null;
    }
    if (/\bCC0\b|\bCC[- ]?zero\b|public domain dedication/i.test(value))
        return "CC0-1.0";
    const named = value.match(
        /\bCC[- ](BY(?:[- ](?:NC|SA|ND))*)[- ](\d\.\d)\b/i,
    );
    if (named) {
        const kind = named[1].toUpperCase().replace(/ /g, "-");
        return CC_KINDS.includes(kind.toLowerCase())
            ? `CC-${kind}-${named[2]}`
            : null;
    }
    return null;
}

/** A URL in some text, or null */
const urlIn = (value: string | null) =>
    value?.match(/https?:\/\/[^\s)"']+/)?.[0] ?? null;

/** The credits the file states, as far as they can be read. */
export function creditsOf(json: RawGltf): ModelCredits {
    const credits: ModelCredits = {};
    const set = (key: keyof ModelCredits, value: string | null) => {
        if (value && !credits[key]) credits[key] = value;
    };

    const packet = assetPacket(json);
    if (packet) {
        const rights = text(packet["dc:rights"]);
        set("author", text(packet["dc:creator"]));
        set("sourceUrl", text(packet["dc:source"]));
        set(
            "license",
            spdxLicenseOf(
                text(packet["xmpRights:WebStatement"]) ??
                    text(packet["cc:license"]) ??
                    text(packet["dcterms:license"]) ??
                    rights,
            ),
        );
        set("attribution", rights);
    }

    const copyright =
        typeof json.asset?.copyright === "string"
            ? json.asset.copyright.trim() || null
            : null;
    set("attribution", copyright);
    set("license", spdxLicenseOf(copyright));

    const extras = isObject(json.asset?.extras) ? json.asset.extras : null;
    if (extras) {
        const author = text(extras.author);
        // Sketchfab writes "name (https://sketchfab.com/name)"
        set("author", author?.replace(/\s*\(https?:[^)]*\)\s*$/, "") || null);
        set("license", spdxLicenseOf(text(extras.license)));
        set("sourceUrl", urlIn(text(extras.source)));
    }
    return credits;
}

/** The model's title, when the file gives one. */
export function titleOf(json: RawGltf): string | null {
    const packet = assetPacket(json);
    const fromPacket = packet ? text(packet["dc:title"]) : null;
    const extras = isObject(json.asset?.extras) ? json.asset.extras : null;
    return fromPacket ?? (extras ? text(extras.title) : null);
}
