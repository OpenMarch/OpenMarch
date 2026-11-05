import { useEffect, useRef, useState } from "react";
import { Button } from "@openmarch/ui";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import clsx from "clsx";
import OpenMarchLogo from "@/components/OpenMarchLogo";
import { prefersReducedMotion } from "@/components/timeline/reducedMotion";
import {
    GUIDES_URL,
    WHATS_NEW_SLIDES,
    whatsNewKeyAction,
    type WhatsNewSlide,
} from "../whatsNewSlides";

/**
 * The slide's clip: a muted loop, or its first frame when the person asked
 * for less motion (or the clip isn't recorded yet). Both carry the same
 * description for screen readers.
 */
function SlideMedia({ slide }: { slide: WhatsNewSlide }) {
    const { t } = useTranslate();
    const description = t(slide.mediaKey);
    const className =
        "rounded-16 border-accent bg-fg-2 ring-accent/15 aspect-[16/10] w-full border-2 object-cover ring-4";
    if (!slide.video || prefersReducedMotion())
        return (
            <img
                src={slide.poster}
                alt={description}
                className={className}
                draggable={false}
                data-testid="whats-new-poster"
            />
        );
    return (
        <video
            key={slide.id}
            src={slide.video}
            poster={slide.poster}
            aria-label={description}
            className={className}
            autoPlay
            muted
            loop
            playsInline
            disablePictureInPicture
            data-testid="whats-new-video"
        />
    );
}

/**
 * Returning people's optional walkthrough of what's new: one feature per
 * slide, with Back, Next (Continue on the last) and Skip, position dots, and
 * the arrow keys and Escape (skip). Each slide's title takes focus, so screen
 * readers announce it. Back on the first slide returns to the welcome page.
 */
// eslint-disable-next-line max-lines-per-function
export default function WhatsNewTour({
    onDone,
    onSkip,
    onBack,
}: {
    /** After the last slide. */
    onDone: () => void;
    /** Skip, on any slide (or Escape). */
    onSkip: () => void;
    /** Back from the first slide. */
    onBack: () => void;
}) {
    const { t } = useTranslate();
    const [index, setIndex] = useState(0);
    const heading = useRef<HTMLHeadingElement>(null);
    const slide = WHATS_NEW_SLIDES[index];
    const total = WHATS_NEW_SLIDES.length;
    const isLast = index === total - 1;

    const next = () => (isLast ? onDone() : setIndex(index + 1));
    const back = () => (index === 0 ? onBack() : setIndex(index - 1));

    useEffect(() => {
        heading.current?.focus();
    }, [index]);

    // Kept in a ref so the listener, added once, always calls the latest.
    const actions = useRef({ next, back, skip: onSkip });
    actions.current = { next, back, skip: onSkip };
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.altKey || event.metaKey) return;
            if (event.ctrlKey || event.shiftKey) return;
            const action = whatsNewKeyAction(event.key);
            if (!action) return;
            event.preventDefault();
            actions.current[action]();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    return (
        <main
            className="flex min-h-0 flex-1 p-8"
            aria-label={t("welcomeFlow.whatsNew.title")}
            aria-roledescription={t("welcomeFlow.whatsNew.carousel")}
            data-testid="welcome-whats-new"
        >
            <div className="bg-fg-1 border-stroke rounded-6 flex min-h-0 flex-1 flex-col overflow-y-auto border px-24 py-24">
                <div className="m-auto flex w-full max-w-[min(46rem,calc((100vh-20rem)*1.6))] flex-col gap-16">
                    <div className="flex items-center justify-between gap-16">
                        <OpenMarchLogo
                            height={28}
                            className="text-text shrink-0"
                        />
                        <span className="text-h4 text-text font-medium">
                            <T keyName="welcomeFlow.whatsNew.title" />
                        </span>
                    </div>

                    <nav
                        className="flex flex-wrap justify-center gap-6"
                        aria-label={t("welcomeFlow.whatsNew.steps")}
                        data-testid="whats-new-steps"
                    >
                        {WHATS_NEW_SLIDES.map((s, i) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setIndex(i)}
                                aria-current={i === index ? "step" : undefined}
                                className={clsx(
                                    "text-body rounded-full px-12 py-4 transition-colors duration-150",
                                    i === index
                                        ? "bg-accent text-text-invert"
                                        : "text-text-subtitle hover:bg-fg-2 hover:text-text",
                                )}
                                data-testid={`whats-new-step-${s.id}`}
                            >
                                <T keyName={s.labelKey} />
                            </button>
                        ))}
                    </nav>

                    <section
                        key={slide.id}
                        className="animate-fade-in flex flex-col gap-16"
                        aria-roledescription={t("welcomeFlow.whatsNew.slide")}
                        aria-label={t("welcomeFlow.whatsNew.position", {
                            current: index + 1,
                            total,
                        })}
                        data-testid={`whats-new-slide-${slide.id}`}
                    >
                        <SlideMedia slide={slide} />
                        <div className="flex flex-col items-center gap-4 text-center">
                            <h1
                                ref={heading}
                                tabIndex={-1}
                                className="text-h3 text-text font-medium outline-hidden"
                            >
                                <T keyName={slide.titleKey} />
                            </h1>
                            <p className="text-body text-text-subtitle max-w-[36rem]">
                                <T keyName={slide.textKey} />
                            </p>
                            {isLast && (
                                <a
                                    href={GUIDES_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sub text-accent mt-4 flex items-center gap-4 hover:underline"
                                    data-testid="whats-new-guides"
                                >
                                    <T keyName="welcomeFlow.whatsNew.guides" />
                                    <ArrowSquareOutIcon size={14} aria-hidden />
                                </a>
                            )}
                        </div>
                    </section>

                    <div className="flex w-full items-center justify-between gap-8 pt-8">
                        <Button
                            variant="secondary"
                            onClick={back}
                            data-testid="whats-new-back"
                        >
                            <T keyName="welcomeFlow.back" />
                        </Button>
                        <div className="flex gap-8">
                            <Button
                                variant="ghost"
                                onClick={onSkip}
                                data-testid="whats-new-skip"
                            >
                                <T keyName="welcomeFlow.whatsNew.skip" />
                            </Button>
                            <Button onClick={next} data-testid="whats-new-next">
                                <T
                                    keyName={
                                        isLast
                                            ? "welcomeFlow.continue"
                                            : "welcomeFlow.whatsNew.next"
                                    }
                                />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
