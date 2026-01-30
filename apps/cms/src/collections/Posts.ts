import type { CollectionConfig, RichTextField } from "payload";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import {
    convertLexicalToMarkdown,
    editorConfigFactory,
    lexicalEditor,
} from "@payloadcms/richtext-lexical";
import { HeadingFeature, LinkFeature } from "@payloadcms/richtext-lexical";

export const Posts: CollectionConfig = {
    slug: "posts",
    admin: {
        useAsTitle: "title",
        defaultColumns: ["title", "author", "date", "updatedAt"],
    },
    access: {
        read: () => true,
    },
    fields: [
        {
            name: "title",
            type: "text",
            required: true,
        },
        {
            name: "author",
            type: "text",
            required: true,
        },
        {
            name: "date",
            type: "date",
            required: true,
            admin: {
                date: {
                    pickerAppearance: "dayAndTime",
                },
            },
        },
        {
            name: "featuredImage",
            type: "upload",
            relationTo: "media",
            required: true,
            filterOptions: {
                mimeType: { contains: "image" },
            },
        },
        {
            name: "content",
            type: "richText",
            required: true,
            editor: lexicalEditor({
                features: ({ defaultFeatures }) => [
                    ...defaultFeatures,
                    HeadingFeature({
                        enabledHeadingSizes: ["h1", "h2", "h3", "h4"],
                    }),
                    LinkFeature({
                        enabledCollections: ["posts"],
                    }),
                ],
            }),
        },
        {
            name: "contentMarkdown",
            type: "textarea",
            admin: {
                description:
                    "Markdown output of the rich text content (read-only, used by the website).",
                readOnly: true,
            },
            hooks: {
                afterRead: [
                    ({ siblingData, siblingFields }) => {
                        const data = siblingData["content"] as
                            | SerializedEditorState
                            | undefined;
                        if (!data) return "";
                        const richTextField = siblingFields.find(
                            (f): f is RichTextField =>
                                "name" in f && f.name === "content",
                        );
                        if (!richTextField) return "";
                        const markdown = convertLexicalToMarkdown({
                            data,
                            editorConfig: editorConfigFactory.fromField({
                                field: richTextField,
                            }),
                        });
                        return markdown;
                    },
                ],
                beforeChange: [
                    ({ siblingData }) => {
                        delete siblingData["contentMarkdown"];
                        return undefined;
                    },
                ],
            },
        },
    ],
};
