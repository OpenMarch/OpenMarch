/* eslint-disable jsx-a11y/heading-has-content */
import Markdown from "react-markdown";

export default function CustomMarkdown({ children }: { children: string }) {
    return (
        <Markdown
            components={{
                h1: ({ node, ...props }) => (
                    <h1 className="text-h1" {...props} />
                ),
                h2: ({ node, ...props }) => (
                    <h2 className="text-h2" {...props} />
                ),
                h3: ({ node, ...props }) => (
                    <h3 className="text-h3" {...props} />
                ),
                h4: ({ node, ...props }) => (
                    <h4 className="text-h4" {...props} />
                ),
                h5: ({ node, ...props }) => (
                    <h5 className="text-h5" {...props} />
                ),
                h6: ({ node, ...props }) => (
                    <h6 className="text-h6" {...props} />
                ),
                ul: ({ node, ...props }) => (
                    <ul className="list-inside list-disc" {...props} />
                ),
                li: ({ node, ...props }) => (
                    <li className="list-item list-inside" {...props} />
                ),
                p: ({ node, ...props }) => (
                    <p className="text-text" {...props} />
                ),
            }}
        >
            {children}
        </Markdown>
    );
}
