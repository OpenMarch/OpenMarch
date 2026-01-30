import ReactMarkdown from "react-markdown";
import { ProseClass } from "@/components/ProseClass";

interface MarkdownContentProps {
    content: string;
    className?: string;
}

/**
 * Renders markdown (e.g. from Payload CMS contentMarkdown) with prose styling.
 */
export default function MarkdownContent({
    content,
    className,
}: MarkdownContentProps) {
    return (
        <div className={[ProseClass, className].filter(Boolean).join(" ")}>
            <ReactMarkdown>{content}</ReactMarkdown>
        </div>
    );
}
