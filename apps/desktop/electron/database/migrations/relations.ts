import { relations } from "drizzle-orm/relations";
import { beats, measures, pages } from "./schema";

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

export const pagesRelations = relations(pages, ({ one }) => ({
    beat: one(beats, {
        fields: [pages.start_beat],
        references: [beats.id],
    }),
}));
