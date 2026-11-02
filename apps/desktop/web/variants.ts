/**
 * TEMPORARY, fork-only (see LAB.md, "Comparing versions"). The version
 * switch: when the lab test lists `variants` in its manifest, testers pick
 * one from a switch at the bottom left and the app changes behavior at once,
 * on the same show. The URL's `variant` parameter says which
 * (`src/lab/labVariant.ts` keeps it), so a reload keeps it and the lab's
 * feedback, which records the page's URL, says which version was on.
 */
import tolgee from "@/global/singletons/Tolgee";
import { useLabVariantStore } from "@/lab/labVariant";

interface LabVariant {
    id: string;
    label: string;
    description: string;
}

/** From the manifest's front matter, at build time (vite.web.config.mts) */
declare const __LAB_VARIANTS__: LabVariant[];

const variants: LabVariant[] = __LAB_VARIANTS__;

const select = (variant: LabVariant) =>
    useLabVariantStore.getState().setVariant(variant.id);

/** Sets the version from the URL, or the first one. Call before the app loads. */
export function initVariants() {
    if (!variants.length) return;
    const current = useLabVariantStore.getState().variant;
    select(variants.find((v) => v.id === current) ?? variants[0]);
}

const BUTTON_STYLE =
    "background:none;border:0;color:#c9c9d3;font:inherit;padding:4px 10px;border-radius:999px;cursor:pointer";
const CHECKED_STYLE = "background:#967eff;color:#fff";

/** Adds the switch to the page, when the test compares versions */
export function mountVariantSwitch() {
    if (!variants.length) return;
    const group = document.createElement("div");
    group.setAttribute("role", "radiogroup");
    // Stands out, since comparing is the test
    group.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:2147483000;display:flex;align-items:center;" +
        "gap:2px;padding:3px 3px 3px 10px;border-radius:999px;background:rgba(20,20,24,0.88);" +
        "border:1px solid #967eff;color:#b9aaff;font:500 12px 'DM Sans',system-ui,sans-serif";
    const name = document.createElement("span");
    name.style.marginRight = "4px";
    group.append(name);
    // The switch comes before the app starts the translations, so its words follow once they
    // load, and on every language change. The versions' own names are the lab test's.
    const word = () => {
        group.setAttribute("aria-label", tolgee.t("web.variants.label"));
        name.textContent = tolgee.t("web.variants.name");
    };
    void tolgee
        .run()
        .catch((error) =>
            console.error("Couldn't load the translations:", error),
        )
        .then(word);
    tolgee.on("language", word);

    const buttons = variants.map((variant) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "radio");
        button.dataset.variant = variant.id;
        button.textContent = variant.label;
        button.title = variant.description || variant.label;
        button.addEventListener("click", () => {
            select(variant);
            // Back to the app, so its shortcuts work straight away
            button.blur();
        });
        return button;
    });
    const update = (current: string | null) =>
        variants.forEach((variant, index) => {
            const checked = variant.id === current;
            buttons[index].setAttribute("aria-checked", String(checked));
            buttons[index].style.cssText =
                BUTTON_STYLE + (checked ? `;${CHECKED_STYLE}` : "");
        });
    update(useLabVariantStore.getState().variant);
    useLabVariantStore.subscribe((state) => update(state.variant));
    group.append(...buttons);
    document.body.append(group);
}
