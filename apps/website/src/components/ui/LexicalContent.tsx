import type {
    DefaultNodeTypes,
    SerializedBlockNode,
    SerializedUploadNode,
} from "@payloadcms/richtext-lexical";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import {
    type JSXConvertersFunction,
    RichText,
} from "@payloadcms/richtext-lexical/react";
import { clsx } from "clsx";
import { buildPayloadUrlFromRelativePath } from "@/lib/payload";
import { ProseClass } from "@/components/ProseClass";

type YouTubeBlockFields = { url: string };
type NodeTypes = DefaultNodeTypes | SerializedBlockNode<YouTubeBlockFields>;

function extractYouTubeVideoId(url: string | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    // youtube.com/watch?v=VIDEO_ID
    const watchMatch = trimmed.match(
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    );
    if (watchMatch) return watchMatch[1];
    // youtu.be/VIDEO_ID
    const shortMatch = trimmed.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];
    // youtube.com/embed/VIDEO_ID
    const embedMatch = trimmed.match(
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    );
    if (embedMatch) return embedMatch[1];
    return null;
}

function getJsxConverters(
    payloadCmsBaseUrl?: string,
): JSXConvertersFunction<NodeTypes> {
    return ({ defaultConverters }) => ({
        ...defaultConverters,
        blocks: {
            youtube: ({ node }) => {
                const url = (node as SerializedBlockNode<YouTubeBlockFields>)
                    .fields?.url;
                const videoId = extractYouTubeVideoId(url);
                if (!videoId) return null;
                return (
                    <div className="rounded-6 border-stroke relative my-6 aspect-video w-full overflow-hidden border">
                        <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title="YouTube video"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="absolute inset-0 h-full w-full"
                        />
                    </div>
                );
            },
        },
        upload: ({ node }) => {
            const uploadNode = node as SerializedUploadNode;
            const value = uploadNode.value;

            if (typeof value !== "object" || value == null) {
                return null;
            }

            const uploadDoc = value as {
                url?: string;
                alt?: string;
                width?: number;
                height?: number;
                mimeType?: string;
            };

            const url = uploadDoc.url;
            if (!url) return null;

            const resolvedUrl = buildPayloadUrlFromRelativePath(
                url,
                payloadCmsBaseUrl,
            );
            const alt =
                (uploadNode as { fields?: { alt?: string } }).fields?.alt ??
                uploadDoc.alt ??
                "";

            const width = uploadDoc.width;
            const height = uploadDoc.height;

            return (
                <img
                    alt={alt}
                    className="rounded-6 border-stroke border"
                    height={height}
                    loading="lazy"
                    src={resolvedUrl}
                    width={width}
                />
            );
        },
    });
}

interface LexicalContentProps {
    /** Serialized Lexical editor state from Payload CMS */
    data: SerializedEditorState | null | undefined;
    /** Optional additional class names for the container */
    className?: string;
    /** Optional CMS base URL when building upload URLs on the client (e.g. preview page) where env may be unset */
    payloadCmsBaseUrl?: string;
}

/**
 * Renders Lexical rich text from Payload CMS with custom converters for
 * images (resolved URLs, alt text) and consistent prose styling.
 */
export default function LexicalContent({
    data,
    className,
    payloadCmsBaseUrl,
}: LexicalContentProps) {
    if (!data) return null;

    return (
        <div className={clsx(ProseClass, className)}>
            <RichText
                converters={getJsxConverters(payloadCmsBaseUrl)}
                data={data}
            />
        </div>
    );
}
