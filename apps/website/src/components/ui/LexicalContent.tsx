import type {
    DefaultNodeTypes,
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

type NodeTypes = DefaultNodeTypes;

const jsxConverters: JSXConvertersFunction<NodeTypes> = ({
    defaultConverters,
}) => ({
    ...defaultConverters,
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

        const resolvedUrl = buildPayloadUrlFromRelativePath(url);
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

interface LexicalContentProps {
    /** Serialized Lexical editor state from Payload CMS */
    data: SerializedEditorState | null | undefined;
    /** Optional additional class names for the container */
    className?: string;
}

/**
 * Renders Lexical rich text from Payload CMS with custom converters for
 * images (resolved URLs, alt text) and consistent prose styling.
 */
export default function LexicalContent({
    data,
    className,
}: LexicalContentProps) {
    if (!data) return null;

    return (
        <div className={clsx(ProseClass, className)}>
            <RichText converters={jsxConverters} data={data} />
        </div>
    );
}
