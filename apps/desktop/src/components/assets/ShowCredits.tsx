/**
 * Credits for the open show (package C5.7, props-spec.md section 10): the
 * embedded items that need attribution, grouped by license, with CC0 and
 * built-in items counted on one line. The Share note badge appears when an
 * item's license is Unknown.
 *
 * TODO(Visuals mode): also on the Library side panel's show tab.
 */
import { useMemo } from "react";
import { T, useTranslate } from "@tolgee/react";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useShowLibrary } from "@/hooks/queries/useShowLibrary";
import {
    creditText,
    licenseLabel,
    showCredits,
    type ShowCredits as Credits,
} from "@/view3d/library/showCredits";

/** The open show's Credits, from its embedded items. */
export function useShowCredits(): Credits | undefined {
    const { data } = useShowLibrary();
    return useMemo(() => (data ? showCredits(data) : undefined), [data]);
}

/** The Share note badge, for Unknown-license items only. */
export function ShareNoteBadge() {
    return (
        <span
            className="text-sub border-yellow text-yellow rounded-full border px-8"
            data-testid="share-note-badge"
        >
            <T keyName="assets.credits.shareNote.badge" />
        </span>
    );
}

export default function ShowCredits() {
    const { t } = useTranslate();
    const credits = useShowCredits();
    if (!credits) return null;
    const words = {
        unknown: t("assets.credits.license.unknown"),
        proprietary: t("assets.credits.license.proprietary"),
    };
    const listed = credits.groups.reduce((n, g) => n + g.lines.length, 0);

    return (
        <details
            className="group flex flex-col gap-8"
            data-testid="show-credits"
        >
            <summary className="text-body flex cursor-pointer list-none items-center gap-8">
                <CaretRightIcon
                    size={14}
                    className="text-text-subtitle duration-150 ease-out group-open:rotate-90"
                />
                <T keyName="assets.credits.title" />
                <span className="text-sub text-text-subtitle font-mono">
                    {listed}
                </span>
                {credits.shareNote && <ShareNoteBadge />}
            </summary>
            <div className="flex flex-col gap-12 pt-8 pl-22">
                {credits.shareNote && (
                    <p className="text-sub text-text-subtitle">
                        <T keyName="assets.credits.shareNote.detail" />
                    </p>
                )}
                {credits.groups.map((group) => {
                    const license = licenseLabel(group.license, words);
                    return (
                        <section
                            key={group.license}
                            className="flex flex-col gap-4"
                            data-testid={`credits-group-${group.license}`}
                        >
                            <h6 className="text-sub text-text-subtitle font-mono uppercase">
                                {license}
                            </h6>
                            <ul className="flex flex-col gap-4">
                                {group.lines.map((line) => (
                                    <li
                                        key={line.itemId}
                                        className="text-sub break-words"
                                    >
                                        {creditText(line, license)}
                                        {line.attribution && (
                                            <span className="text-text-subtitle block">
                                                {line.attribution}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })}
                {listed === 0 && (
                    <p className="text-sub text-text-subtitle">
                        <T keyName="assets.credits.none" />
                    </p>
                )}
                {credits.uncredited > 0 && (
                    <p
                        className="text-sub text-text-subtitle"
                        data-testid="credits-uncredited"
                    >
                        <T
                            keyName="assets.credits.uncredited"
                            params={{ count: credits.uncredited }}
                        />
                    </p>
                )}
            </div>
        </details>
    );
}

/** The export dialog's one quiet line, when an item's license is Unknown. */
export function ShareNoteExportLine() {
    const credits = useShowCredits();
    if (!credits?.shareNote) return null;
    return (
        <p
            className="text-sub text-text-subtitle"
            data-testid="share-note-export"
        >
            <T keyName="assets.credits.shareNote.export" />
        </p>
    );
}
