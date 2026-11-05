import { useEffect, useRef, useState, type ReactNode } from "react";
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
        "rounded-6 border-stroke bg-fg-2 aspect-[16/10] w-full border object-cover";
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
 * The walkthrough of what's new: one feature per slide, with Back, Next
 * (Continue, or `finishKey`, on the last) and Skip, position dots, and the
 * arrow keys and Escape (skip). Each slide's title takes focus, so screen
 * readers announce it.
 *
 * - `page`: returning people's optional step in the welcome flow, filling the
 *   window. Back on the first slide returns to the welcome page.
 * - `dialog`: the same slides inside a dialog (Help › What's new), with the
 *   dialog's `header`. Without `onBack`, Back is off on the first slide.
 */
// eslint-disable-next-line max-lines-per-function
export default function WhatsNewTour({
    onDone,
    onSkip,
    onBack,
    variant = "page",
    header,
    finishKey = "welcomeFlow.continue",
}: {
    /** After the last slide. */
    onDone: () => void;
    /** Skip, on any slide (or Escape). */
    onSkip: () => void;
    /** Back from the first slide; without it, Back is off there. */
    onBack?: () => void;
    variant?: "page" | "dialog";
    /** Replaces the logo and "What's new" label above the slides. */
    header?: ReactNode;
    /** The last slide's Next label, an i18n key. */
    finishKey?: string;
}) {
    const { t } = useTranslate();
    const [index, setIndex] = useState(0);
    const heading = useRef<HTMLHeadingElement>(null);
    const slide = WHATS_NEW_SLIDES[index];
    const total = WHATS_NEW_SLIDES.length;
    const isLast = index === total - 1;

    const next = () => (isLast ? onDone() : setIndex(index + 1));
    const back = () => (index === 0 ? onBack?.() : setIndex(index - 1));

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

    const label = {
        "aria-label": t("welcomeFlow.whatsNew.title"),
        "aria-roledescription": t("welcomeFlow.whatsNew.carousel"),
    };
    const content = (
        <div className="m-auto flex w-full max-w-[min(46rem,calc((100vh-20rem)*1.6))] flex-col gap-16">
            {header ?? (
                <div className="flex items-center justify-between gap-16">
                    <OpenMarchLogo height={28} className="text-text shrink-0" />
                    <span className="text-sub text-text-subtitle tracking-wide uppercase">
                        <T keyName="welcomeFlow.whatsNew.title" />
                    </span>
                </div>
            )}

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
                    disabled={index === 0 && !onBack}
                    data-testid="whats-new-back"
                >
                    <T keyName="welcomeFlow.back" />
                </Button>
                <div
                    className="flex items-center gap-6"
                    aria-hidden
                    data-testid="whats-new-dots"
                >
                    {WHATS_NEW_SLIDES.map((s, i) => (
                        <span
                            key={s.id}
                            data-current={i === index || undefined}
                            className={clsx(
                                "size-8 rounded-full transition-colors duration-150",
                                i === index ? "bg-accent" : "bg-text/20",
                            )}
                        />
                    ))}
                </div>
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
                                isLast ? finishKey : "welcomeFlow.whatsNew.next"
                            }
                        />
                    </Button>
                </div>
            </div>
        </div>
    );

    if (variant === "dialog")
        return (
            <div {...label} data-testid="whats-new-dialog-tour">
                {content}
            </div>
        );
    return (
        <main
            className="flex min-h-0 flex-1 p-8"
            {...label}
            data-testid="welcome-whats-new"
        >
            <div className="bg-fg-1 border-stroke rounded-6 flex min-h-0 flex-1 flex-col overflow-y-auto border px-24 py-24">
                {content}
            </div>
        </main>
    );
}
