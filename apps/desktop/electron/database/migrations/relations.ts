import { relations } from "drizzle-orm/relations";
import {
    beats,
    measures,
    pages,
    marcher_pages,
    marchers,
    shape_pages,
    shapes,
    shape_page_marchers,
} from "./schema";

export const measuresRelations = relations(measures, ({ one }) => ({
    beat: one(beats, {
        fields: [measures.start_beat],
        references: [beats.id],
    }),
}));

export const beatsRelations = relations(beats, ({ many }) => ({
    measures: many(measures),
    pages: many(pages),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
    beat: one(beats, {
        fields: [pages.start_beat],
        references: [beats.id],
    }),
    marcher_pages: many(marcher_pages),
    shape_pages: many(shape_pages),
}));

export const marcher_pagesRelations = relations(marcher_pages, ({ one }) => ({
    page: one(pages, {
        fields: [marcher_pages.page_id],
        references: [pages.id],
    }),
    marcher: one(marchers, {
        fields: [marcher_pages.marcher_id],
        references: [marchers.id],
    }),
}));

export const marchersRelations = relations(marchers, ({ many }) => ({
    marcher_pages: many(marcher_pages),
    shape_page_marchers: many(shape_page_marchers),
}));

export const shape_pagesRelations = relations(shape_pages, ({ one, many }) => ({
    page: one(pages, {
        fields: [shape_pages.page_id],
        references: [pages.id],
    }),
    shape: one(shapes, {
        fields: [shape_pages.shape_id],
        references: [shapes.id],
    }),
    shape_page_marchers: many(shape_page_marchers),
}));

export const shapesRelations = relations(shapes, ({ many }) => ({
    shape_pages: many(shape_pages),
}));

export const shape_page_marchersRelations = relations(
    shape_page_marchers,
    ({ one }) => ({
        marcher: one(marchers, {
            fields: [shape_page_marchers.marcher_id],
            references: [marchers.id],
        }),
        shape_page: one(shape_pages, {
            fields: [shape_page_marchers.shape_page_id],
            references: [shape_pages.id],
        }),
    }),
);
