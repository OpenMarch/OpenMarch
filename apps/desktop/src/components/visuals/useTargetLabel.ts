import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import type { CueTarget } from "@openmarch/core";
import { allTagsQueryOptions } from "@/hooks/queries/tags/queries";
import { getSectionObjectByName } from "@/global/classes/Sections";

/**
 * Names a cue's target for people: "Band", a section (translated when it's
 * built in, else as the show spells it), a tag's name, or "3 marchers". A
 * null target is the selection with nobody selected.
 */
export function useTargetLabel() {
    const { t } = useTranslate();
    const { data: tags } = useQuery(allTagsQueryOptions());
    return (target: CueTarget | null): string => {
        if (!target) return t("visuals.inspector.selection");
        switch (target.kind) {
            case "band":
                return t("visuals.inspector.band");
            case "section": {
                const section = getSectionObjectByName(target.section.trim());
                return section.name === target.section.trim()
                    ? t(section.tName)
                    : target.section.trim();
            }
            case "tag": {
                const tag = tags?.find((x) => x.id === target.tagId);
                return (
                    tag?.name?.trim() ||
                    t("visuals.inspector.unnamedTag", {
                        id: String(target.tagId),
                    })
                );
            }
            case "set":
                return t("visuals.band.marchers", {
                    count: target.marcherIds.length,
                });
        }
    };
}
