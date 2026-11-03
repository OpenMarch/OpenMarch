import { useEffect, useMemo, useState } from "react";
import { T, useTolgee, useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
import OpenMarchLogo from "@/components/OpenMarchLogo";
import launchImage from "@/assets/welcome/launch-image.webp";
import { APP_LANGUAGES, type AppLanguage } from "@/utilities/languages";
import CyclingText, { useCycleIndex } from "../CyclingText";
import DevSkipSetupButton from "../DevSkipSetupButton";

/** The page's text that changes language along with the greeting. */
const CYCLED_KEYS = {
    title: "welcomeFlow.welcome.title",
    description: "welcomeFlow.welcome.description",
    getStarted: "welcomeFlow.getStarted",
} as const;

/** The same page for someone who used OpenMarch before. */
const RETURNING_KEYS = {
    title: "welcomeFlow.welcomeBack.title",
    description: "welcomeFlow.welcomeBack.description",
    getStarted: "welcomeFlow.welcomeBack.start",
} as const;

/**
 * The first page: the photo (bundled, so nothing loads from the internet
 * before the analytics question) on one side; the logo, a greeting and
 * Get started on the other. The page's text fades through every app language
 * together, starting on `startLanguage`; the next step is in the app's
 * language again. Narrow windows stack the two sides.
 *
 * A returning person (`returning`) gets "Welcome back" and a way into What's
 * new instead, in the app's language only: their language is known or was
 * English, and the language step still follows if it was never chosen.
 */
// eslint-disable-next-line max-lines-per-function
export default function WelcomeStep({
    onStart,
    onDevSkip,
    devSkipDisabled,
    startLanguage,
    returning = false,
    "aria-label": ariaLabel,
}: {
    onStart: () => void;
    /** Skips setup; the button shows in developer builds only. */
    onDevSkip: () => void;
    /** Disables that button, e.g. while settings are still being read. */
    devSkipDisabled?: boolean;
    /** The language to show first: the one the flow will suggest. */
    startLanguage: string;
    /** The person used OpenMarch before: "Welcome back", no cycling. */
    returning?: boolean;
    "aria-label"?: string;
}) {
    const { t } = useTranslate();
    const tolgee = useTolgee(["language"]);
    const [imageFailed, setImageFailed] = useState(false);
    // Only the app's language is loaded at first; cycle once all are.
    const [allLoaded, setAllLoaded] = useState(false);

    useEffect(() => {
        let active = true;
        tolgee
            .loadRecords(APP_LANGUAGES.map(({ code }) => ({ language: code })))
            .then(() => {
                if (active) setAllLoaded(true);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [tolgee]);

    const keys = returning ? RETURNING_KEYS : CYCLED_KEYS;
    const cycling = allLoaded && !returning;
    const languages: readonly AppLanguage[] = useMemo(() => {
        if (cycling) return APP_LANGUAGES;
        const current = tolgee.getLanguage();
        return [
            APP_LANGUAGES.find((l) => l.code === current) ?? APP_LANGUAGES[0],
        ];
    }, [cycling, tolgee]);

    const index = useCycleIndex(
        languages.length,
        Math.max(
            0,
            languages.findIndex((l) => l.code === startLanguage),
        ),
    );

    const texts = (text: (language: AppLanguage) => string) =>
        languages.map((language) => ({
            key: language.code,
            lang: language.code,
            text: text(language),
        }));
    const translated = (key: string) =>
        texts((language) =>
            cycling ? tolgee.t({ key, language: language.code }) : t(key),
        );

    return (
        <main
            className="flex min-h-0 flex-1 flex-col gap-8 p-8 md:flex-row"
            aria-label={ariaLabel}
            data-testid="welcome-flow"
        >
            <div className="bg-fg-2 border-stroke rounded-6 relative h-[30vh] shrink-0 overflow-hidden border md:h-auto md:flex-[1.15]">
                {!imageFailed && (
                    <img
                        src={launchImage}
                        alt=""
                        draggable={false}
                        onError={() => setImageFailed(true)}
                        className="animate-fade-in h-full w-full object-cover object-[50%_35%]"
                    />
                )}
            </div>

            <div className="bg-fg-1 border-stroke rounded-6 flex min-h-0 flex-1 flex-col overflow-y-auto border px-32 py-32">
                <div className="m-auto flex max-w-[28rem] flex-col items-center gap-24 text-center">
                    <OpenMarchLogo height={64} className="text-text" />
                    {/* The visible text changes language, so screen readers
                        get it in the app's language. */}
                    <h1 className="sr-only">
                        <T keyName={keys.title} />
                    </h1>
                    <CyclingText
                        texts={
                            returning
                                ? translated(keys.title)
                                : texts((language) => language.greeting)
                        }
                        index={index}
                        className="text-h1 text-text leading-tight font-medium"
                        data-testid="welcome-greeting"
                    />
                    <p className="sr-only">
                        <T keyName={keys.description} />
                    </p>
                    <CyclingText
                        texts={translated(keys.description)}
                        index={index}
                        wrap
                        className="text-body text-text-subtitle"
                        data-testid="welcome-description"
                    />
                    <Button
                        size="default"
                        onClick={onStart}
                        className="mt-8 gap-8 px-24"
                        aria-label={t(keys.getStarted)}
                        data-testid="welcome-continue"
                        autoFocus
                    >
                        <CyclingText
                            texts={translated(keys.getStarted)}
                            index={index}
                        />
                        <ArrowRightIcon size={18} />
                    </Button>
                    <DevSkipSetupButton
                        onSkip={onDevSkip}
                        disabled={devSkipDisabled}
                        className="-mt-16"
                    />
                </div>
            </div>
        </main>
    );
}
