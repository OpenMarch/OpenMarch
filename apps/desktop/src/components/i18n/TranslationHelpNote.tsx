import { T } from "@tolgee/react";
import type { ReactNode } from "react";

/** Where someone who wants to help translate OpenMarch finds out how to join. */
export const HELP_TRANSLATE_URL =
    "https://openmarch.com/developers/translating/#for-translators-non-coders";

function HelpLink({ children }: { children?: ReactNode }) {
    return (
        <button
            type="button"
            onClick={() =>
                void window.electron.openExternal(HELP_TRANSLATE_URL)
            }
            className="text-accent focus-visible:outline-accent rounded-4 underline-offset-2 outline-hidden hover:underline focus-visible:outline-2"
        >
            {children}
        </button>
    );
}

/**
 * The line under a language picker. In English it invites people to add their language; in any
 * other language it says the translation was made with AI and asks for help checking it.
 */
export default function TranslationHelpNote({
    language,
}: {
    language: string;
}) {
    const link = (content: ReactNode) => <HelpLink>{content}</HelpLink>;
    return (
        <span data-testid="translation-help-note">
            {language === "en" ? (
                <T keyName="languages.help.addYours" params={{ link }} />
            ) : (
                <T keyName="languages.help.madeWithAi" params={{ link }} />
            )}
        </span>
    );
}
