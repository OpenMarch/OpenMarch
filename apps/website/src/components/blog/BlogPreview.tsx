import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { useEffect, useState } from "react";
import {
    getPayloadPostPreview,
    parsePayloadPostToListItem,
    type PayloadPost,
} from "@/lib/payload";
import LexicalContent from "@/components/ui/LexicalContent";

interface BlogPreviewProps {
    payloadCmsUrl: string | undefined;
    placeholderImageUrl: string;
}

export default function BlogPreview({
    payloadCmsUrl,
    placeholderImageUrl,
}: BlogPreviewProps) {
    const [post, setPost] = useState<PayloadPost | null | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [params, setParams] = useState<{ id: string; token: string } | null>(
        null,
    );

    useEffect(() => {
        const search = new URLSearchParams(
            typeof window !== "undefined" ? window.location.search : "",
        );
        const id = search.get("id") ?? "";
        const token = search.get("token") ?? "";
        setParams({ id, token });
    }, []);

    useEffect(() => {
        if (!payloadCmsUrl || !params || !params.id || !params.token) return;
        let cancelled = false;
        setError(null);
        setPost(undefined);
        getPayloadPostPreview(params.id, params.token, payloadCmsUrl)
            .then((doc) => {
                if (!cancelled) setPost(doc ?? null);
            })
            .catch(() => {
                if (!cancelled) setError("Failed to load preview");
            });
        return () => {
            cancelled = true;
        };
    }, [payloadCmsUrl, params?.id, params?.token]);

    if (!payloadCmsUrl) {
        return (
            <p className="text-body py-16 text-center">
                Preview not configured.
            </p>
        );
    }

    if (params === null) {
        return <p className="text-body py-16 text-center">Loading preview…</p>;
    }

    if (!params.id || !params.token) {
        return (
            <p className="text-body py-16 text-center">
                Invalid or missing preview link. Use ?id=...&token=...
            </p>
        );
    }

    if (post === undefined && !error) {
        return <p className="text-body py-16 text-center">Loading preview…</p>;
    }

    if (error || post === null) {
        return (
            <p className="text-body py-16 text-center">
                Invalid or missing preview link.
            </p>
        );
    }

    const parsed = parsePayloadPostToListItem(
        post,
        placeholderImageUrl,
        payloadCmsUrl,
    );
    const dateFormatted = parsed.date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    });

    return (
        <article className="relative flex w-full max-w-[50rem] flex-col items-center gap-16">
            <img
                src={parsed.imageUrl}
                width={parsed.imageWidth ?? 1280}
                height={parsed.imageHeight ?? 720}
                alt={parsed.imageAlt}
                className="rounded-6 border-stroke aspect-video h-auto w-full border object-cover"
            />
            <div
                className="absolute top-[10vh] left-1/2 -z-50 aspect-video h-auto w-full -translate-x-1/2"
                style={{
                    background:
                        "radial-gradient(ellipse, oklch(from var(--color-accent) l c h / 0.3) 0%, transparent 70%)",
                }}
            />
            <h1 className="text-h3 text-center">{parsed.title}</h1>
            <div className="flex items-center gap-16">
                {parsed.authorProfileImageUrl ? (
                    <img
                        src={parsed.authorProfileImageUrl}
                        alt=""
                        width={parsed.authorProfileImageWidth ?? 112}
                        height={parsed.authorProfileImageHeight ?? 112}
                        className="size-32 shrink-0 rounded-full object-cover"
                    />
                ) : null}
                <p className="text-body">{parsed.author}</p>
                <p className="text-body">{dateFormatted}</p>
            </div>
            <LexicalContent
                data={post.content as SerializedEditorState | null | undefined}
                payloadCmsBaseUrl={payloadCmsUrl}
            />
        </article>
    );
}
