/**
 * The Artwork template download menu (package C1.12, props-spec.md §3
 * "Artwork size and templates"). It lists every template the app makes,
 * grouped by surface kind, and saves one format per click (Q53) through
 * `library:template-save`; main shows the save dialog and writes the file.
 *
 * Shown in the Assets sidebar tab (Q76). Self-contained so it can move to
 * the Library side panel (Visuals mode, props-spec.md §12) when that panel
 * exists.
 */
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
    CaretDownIcon,
    CaretRightIcon,
    DownloadSimpleIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import { toast } from "sonner";
import {
    TEMPLATE_DOWNLOADS,
    TEMPLATE_DOWNLOAD_GROUPS,
    type TemplateDownload,
    type TemplateDownloadGroup,
} from "@/view3d/core/artworkTemplates/downloads";
import { formatLength } from "@/view3d/core/sizes/units";
import {
    createImportClient,
    type ImportClient,
} from "@/view3d/library/importClient";
import type { TemplateFormat } from "@/view3d/library/protocol";

/** Menu order (the owner's list: PNG, SVG or PDF). */
export const MENU_FORMATS: readonly TemplateFormat[] = ["png", "svg", "pdf"];

type TemplateSaver = Pick<ImportClient, "saveTemplate">;
type Translate = ReturnType<typeof useTranslate>["t"];

let editorClient: TemplateSaver | undefined;
function defaultClient(): TemplateSaver {
    editorClient ??= createImportClient();
    return editorClient;
}

/** The size as drawn: the template's own unit system. */
export function templateSizeText(download: TemplateDownload): string {
    const { width, height, unit } = download.surface;
    const system = unit === "mm" ? "metric" : "imperial";
    return `${formatLength(width, system)} × ${formatLength(height, system)}`;
}

export function templateLabel(download: TemplateDownload, t: Translate) {
    const name = download.catalogName ?? download.surface.name;
    if (download.sag) {
        return t("library.templates.withSag", {
            name,
            sag: formatLength(download.sag, "imperial"),
        });
    }
    if (download.variant === "sagging-bottom") {
        return t("library.templates.saggingBottom", { name });
    }
    if (download.face) {
        return t(`library.templates.propFace.${download.face}`, { name });
    }
    if (download.uniformPart && download.uniformSide) {
        return t(`library.templates.uniformSide.${download.uniformSide}`, {
            part: t(`library.templates.uniformPart.${download.uniformPart}`),
        });
    }
    return name;
}

const itemClass =
    "rounded-4 text-body data-[highlighted]:bg-text/10 flex h-28 cursor-pointer items-center gap-8 px-8 outline-hidden select-none";
const panelClass =
    "border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text z-50 flex flex-col border p-4";

export default function ArtworkTemplatesMenu({
    client,
}: {
    /** Defaults to the editor's import client. */
    client?: TemplateSaver;
}) {
    const { t } = useTranslate();

    async function save(download: TemplateDownload, format: TemplateFormat) {
        try {
            const result = await (client ?? defaultClient()).saveTemplate({
                surfaceId: download.surface.id,
                format,
            });
            if (!result.ok) {
                console.error("Template save failed", result.error);
                toast.error(t("library.templates.saveFailed"));
            } else if (result.value) {
                toast.success(
                    t("library.templates.saved", {
                        filename: result.value.filename,
                    }),
                );
            }
        } catch (error) {
            console.error("Template save failed", error);
            toast.error(t("library.templates.saveFailed"));
        }
    }

    return (
        <Dropdown.Root>
            <Dropdown.Trigger
                data-testid="artwork-templates-menu"
                className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
            >
                <DownloadSimpleIcon size={24} />
                <T keyName="library.templates.menu" />
                <CaretDownIcon size={18} />
            </Dropdown.Trigger>
            <Dropdown.Portal>
                <Dropdown.Content
                    align="start"
                    sideOffset={8}
                    className={`${panelClass} min-w-[13rem]`}
                >
                    <Dropdown.Label className="text-sub text-text/60 px-8 py-4 font-mono uppercase">
                        <T keyName="library.templates.menuHint" />
                    </Dropdown.Label>
                    {TEMPLATE_DOWNLOAD_GROUPS.map((group) => (
                        <TemplateGroup
                            key={group}
                            group={group}
                            t={t}
                            onSave={(download, format) =>
                                void save(download, format)
                            }
                        />
                    ))}
                </Dropdown.Content>
            </Dropdown.Portal>
        </Dropdown.Root>
    );
}

function TemplateGroup({
    group,
    t,
    onSave,
}: {
    group: TemplateDownloadGroup;
    t: Translate;
    onSave: (download: TemplateDownload, format: TemplateFormat) => void;
}) {
    const downloads = TEMPLATE_DOWNLOADS.filter((d) => d.group === group);
    return (
        <Dropdown.Sub>
            <Dropdown.SubTrigger
                data-testid={`artwork-templates-group-${group}`}
                className={`${itemClass} data-[state=open]:bg-text/10 justify-between`}
            >
                <T keyName={`library.templates.groups.${group}`} />
                <CaretRightIcon size={12} className="text-text/60" />
            </Dropdown.SubTrigger>
            <Dropdown.Portal>
                <Dropdown.SubContent
                    sideOffset={6}
                    collisionPadding={8}
                    className={`${panelClass} max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] min-w-[22rem] overflow-y-auto`}
                >
                    {downloads.map((download) => (
                        <TemplateRow
                            key={download.surface.id}
                            download={download}
                            label={templateLabel(download, t)}
                            t={t}
                            onSave={onSave}
                        />
                    ))}
                </Dropdown.SubContent>
            </Dropdown.Portal>
        </Dropdown.Sub>
    );
}

function TemplateRow({
    download,
    label,
    t,
    onSave,
}: {
    download: TemplateDownload;
    label: string;
    t: Translate;
    onSave: (download: TemplateDownload, format: TemplateFormat) => void;
}) {
    return (
        <Dropdown.Group
            aria-label={label}
            data-surface={download.surface.id}
            className="flex items-center gap-12 px-8 py-4"
        >
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body truncate">{label}</span>
                <span className="text-sub text-text/60 font-mono">
                    {templateSizeText(download)}
                </span>
            </div>
            {MENU_FORMATS.map((format) => (
                <Dropdown.Item
                    key={format}
                    aria-label={t("library.templates.download", {
                        name: label,
                        format: format.toUpperCase(),
                    })}
                    onSelect={() => onSave(download, format)}
                    className={`${itemClass} text-sub font-mono`}
                >
                    {format.toUpperCase()}
                </Dropdown.Item>
            ))}
        </Dropdown.Group>
    );
}
