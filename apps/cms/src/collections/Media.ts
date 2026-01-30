import type { CollectionConfig } from "payload";

export const Media: CollectionConfig = {
    slug: "media",
    access: {
        read: () => true,
    },
    fields: [
        {
            name: "alt",
            type: "text",
            required: true,
        },
    ],
    upload: {
        crop: false,
        focalPoint: false,
    },
};
