import { relations } from "drizzle-orm/relations";
import {
    beats,
    measures,
    pages,
    marcherPages,
    marchers,
    shapePages,
    shapes,
    shapePageMarchers,
} from "./schema";

export const measuresRelations = relations(measures, ({ one }) => ({
    beat: one(beats, {
        fields: [measures.startBeat],
        references: [beats.id],
    }),
}));

export const beatsRelations = relations(beats, ({ many }) => ({
    measures: many(measures),
    pages: many(pages),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
    beat: one(beats, {
        fields: [pages.startBeat],
        references: [beats.id],
    }),
    marcherPages: many(marcherPages),
    shapePages: many(shapePages),
}));

export const marcherPagesRelations = relations(marcherPages, ({ one }) => ({
    page: one(pages, {
        fields: [marcherPages.pageId],
        references: [pages.id],
    }),
    marcher: one(marchers, {
        fields: [marcherPages.marcherId],
        references: [marchers.id],
    }),
}));

export const marchersRelations = relations(marchers, ({ many }) => ({
    marcherPages: many(marcherPages),
    shapePageMarchers: many(shapePageMarchers),
}));

export const shapePagesRelations = relations(shapePages, ({ one, many }) => ({
    page: one(pages, {
        fields: [shapePages.pageId],
        references: [pages.id],
    }),
    shape: one(shapes, {
        fields: [shapePages.shapeId],
        references: [shapes.id],
    }),
    shapePageMarchers: many(shapePageMarchers),
}));

export const shapesRelations = relations(shapes, ({ many }) => ({
    shapePages: many(shapePages),
}));

export const shapePageMarchersRelations = relations(
    shapePageMarchers,
    ({ one }) => ({
        marcher: one(marchers, {
            fields: [shapePageMarchers.marcherId],
            references: [marchers.id],
        }),
        shapePage: one(shapePages, {
            fields: [shapePageMarchers.shapePageId],
            references: [shapePages.id],
        }),
    }),
);
