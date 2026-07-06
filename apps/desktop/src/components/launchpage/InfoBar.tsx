import { Button } from "@openmarch/ui";
import { SidebarSimpleIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

const NEWS_FEED_URL = "https://openmarch.com/blog/news.json";

interface NewsFeedItem {
    id: string;
    title: string;
    author: string;
    date: string;
    imageUrl: string;
    imageAlt: string;
    url: string;
}

interface NewsFeedResponse {
    posts?: NewsFeedItem[];
}

const infoSections = [
    {
        id: "news",
        labelKey: "launchpage.infobar.news.title",
        headlineKey: "launchpage.infobar.news.placeholderTitle",
        bodyKey: "launchpage.infobar.news.placeholderBody",
    },
    {
        id: "scores",
        labelKey: "launchpage.infobar.scores.title",
        headlineKey: "launchpage.infobar.scores.placeholderTitle",
        bodyKey: "launchpage.infobar.scores.placeholderBody",
    },
    {
        id: "community",
        labelKey: "launchpage.infobar.community.title",
        headlineKey: "launchpage.infobar.community.placeholderTitle",
        bodyKey: "launchpage.infobar.community.placeholderBody",
    },
] as const;

export default function InfoBar() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

    const scrollToSection = (sectionId: string) => {
        sectionRefs.current[sectionId]?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    };

    return (
        <aside
            className={clsx(
                "relative flex h-full shrink-0 flex-col transition-[width] duration-150 ease-out max-[900px]:hidden",
                isCollapsed
                    ? "w-0 overflow-visible"
                    : "bg-fg-1 border-stroke rounded-6 w-[300px] border p-12",
            )}
            aria-label="Info bar"
        >
            <div
                className={clsx(
                    "flex items-center gap-8",
                    isCollapsed
                        ? "absolute top-8 right-0 z-20"
                        : "justify-between",
                )}
            >
                {!isCollapsed && (
                    <div className="min-w-0">
                        <h2 className="text-h4 min-w-0 break-words">
                            <T keyName="launchpage.infobar.title" />
                        </h2>
                        <p className="text-body text-text-subtitle min-w-0 break-words">
                            <T keyName="launchpage.infobar.placeholderNotice" />
                        </p>
                    </div>
                )}
                <Button
                    variant="secondary"
                    content="icon"
                    className="shrink-0"
                    aria-label={
                        isCollapsed ? "Expand info bar" : "Collapse info bar"
                    }
                    onClick={() => setIsCollapsed((collapsed) => !collapsed)}
                >
                    <SidebarSimpleIcon size={20} />
                </Button>
            </div>

            {!isCollapsed && (
                <>
                    <nav
                        className="mt-16 flex gap-6 overflow-x-auto"
                        aria-label="Info sections"
                    >
                        {infoSections.map(({ id, labelKey }) => (
                            <button
                                key={id}
                                type="button"
                                className="rounded-6 hover:bg-fg-2 focus-visible:bg-fg-2 focus-visible:outline-accent text-body shrink-0 px-8 py-4 duration-150"
                                onClick={() => scrollToSection(id)}
                            >
                                <T keyName={labelKey} />
                            </button>
                        ))}
                    </nav>

                    <div className="mt-16 flex min-h-0 flex-1 flex-col gap-20 overflow-y-auto pr-4 select-text">
                        {infoSections.map(
                            ({ id, labelKey, headlineKey, bodyKey }) => (
                                <section
                                    key={id}
                                    id={`infobar-${id}`}
                                    ref={(element) => {
                                        sectionRefs.current[id] = element;
                                    }}
                                    className="flex scroll-mt-4 flex-col gap-6"
                                >
                                    <h3 className="text-body text-text-subtitle min-w-0 font-medium tracking-wide break-words uppercase">
                                        <T keyName={labelKey} />
                                    </h3>
                                    {id === "news" ? (
                                        <NewsSection />
                                    ) : (
                                        <>
                                            <p className="text-body text-accent font-medium tracking-wide uppercase">
                                                <T keyName={headlineKey} />
                                            </p>
                                            <p className="text-body text-text-subtitle leading-[160%]">
                                                <T keyName={bodyKey} />
                                            </p>
                                        </>
                                    )}
                                </section>
                            ),
                        )}
                    </div>
                </>
            )}
        </aside>
    );
}

function NewsSection() {
    const [news, setNews] = useState<NewsFeedItem[]>([]);
    const [status, setStatus] = useState<"loading" | "ready" | "error">(
        "loading",
    );

    useEffect(() => {
        const controller = new AbortController();

        async function fetchNews() {
            if (!navigator.onLine) {
                setStatus("error");
                setNews([]);
                return;
            }

            try {
                setStatus("loading");
                const response = await fetch(NEWS_FEED_URL, {
                    signal: controller.signal,
                });

                if (!response.ok) throw new Error("Failed to fetch news");

                const data = (await response.json()) as NewsFeedResponse;
                setNews(data.posts ?? []);
                setStatus("ready");
            } catch (error) {
                if (controller.signal.aborted) return;
                console.error("Failed to fetch launch page news", error);
                setNews([]);
                setStatus("error");
            }
        }

        void fetchNews();

        return () => controller.abort();
    }, []);

    if (status === "error") {
        return (
            <p className="text-body text-text-subtitle leading-[160%]">
                <T keyName="launchpage.infobar.news.noInternet" />
            </p>
        );
    }

    if (status === "loading") {
        return (
            <p className="text-body text-text-subtitle leading-[160%]">
                <T keyName="launchpage.infobar.news.loading" />
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            {news.map((post) => (
                <a
                    key={post.id}
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="border-stroke bg-fg-1 hover:border-accent rounded-6 flex flex-col overflow-hidden border duration-150 ease-out"
                >
                    <img
                        src={post.imageUrl}
                        alt={post.imageAlt}
                        className="aspect-video h-auto w-full object-cover"
                    />
                    <div className="flex flex-col gap-6 p-10">
                        <h4 className="text-body min-w-0 leading-[130%] font-medium break-words">
                            {post.title}
                        </h4>
                        <div className="text-body text-text-subtitle flex flex-col gap-2 leading-[150%]">
                            <p>{post.author}</p>
                            <p>{formatNewsDate(post.date)}</p>
                        </div>
                    </div>
                </a>
            ))}
        </div>
    );
}

function formatNewsDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    });
}
