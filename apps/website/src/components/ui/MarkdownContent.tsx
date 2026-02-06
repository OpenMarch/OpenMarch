import ReactMarkdown from "react-markdown";
import { ProseClass } from "@/components/ProseClass";

interface MarkdownContentProps {
    content: string;
    className?: string;
}

/**
 * Renders markdown with prose styling. Used for markdown content from various sources.
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
