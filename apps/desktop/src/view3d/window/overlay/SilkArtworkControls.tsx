/**
 * The guard's flag silk Artwork in the settings panel (fork #973): download
 * the template for the show's silk shape, paint it, import the PNG. The
 * import goes to the editor (`window.view3d.requestSilkArtwork`), which
 * stores it in the show with undo; the relayed invalidation brings it back
 * here and onto the silks.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import { silkArtworkQueryOptions } from "@/hooks/queries/useSilkArtwork";
import {
    artworkTemplateFile,
    silkShapeSurface,
    type TemplateFormat,
} from "@/view3d/core/artworkTemplates";
import {
    SILK_ARTWORK_MAX_BYTES,
    SILK_ARTWORK_MAX_FILE_BYTES,
    SILK_ARTWORK_MAX_PIXELS,
    SILK_ARTWORK_MAX_PX,
    pngSize,
    type SilkArtworkImport,
} from "@/view3d/core/silkArtwork";
import { silkShape, silkShapeOf } from "@/view3d/core/sizes/silkShapes";
import { useVenueRequest } from "./VenueControls";

const FORMATS: readonly TemplateFormat[] = ["png", "svg", "pdf"];

/** zlib deflate with the browser's own compressor, for the template PNG. */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data as Uint8Array<ArrayBuffer>])
        .stream()
        .pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function saveFile(name: string, mimeType: string, data: string | Uint8Array) {
    const blob = new Blob(
        [typeof data === "string" ? data : (data as Uint8Array<ArrayBuffer>)],
        { type: mimeType },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A picked file as an Artwork import, or the reason it can't be one. The
 * size comes from the PNG's header; an image longer than the silk texture
 * (`SILK_ARTWORK_MAX_PX`) is scaled down to it before the show stores it,
 * so a template painted at full size imports without a size limit getting
 * in the way.
 */
async function readArtwork(
    file: File,
): Promise<SilkArtworkImport | "notPng" | "tooLarge"> {
    if (file.size > SILK_ARTWORK_MAX_FILE_BYTES) return "tooLarge";
    const original = new Uint8Array(await file.arrayBuffer());
    const size = pngSize(original);
    if (!size) return "notPng";
    if (size.width * size.height > SILK_ARTWORK_MAX_PIXELS) return "tooLarge";
    const scale = Math.min(
        1,
        SILK_ARTWORK_MAX_PX / Math.max(size.width, size.height),
    );
    if (scale === 1) {
        return original.length > SILK_ARTWORK_MAX_BYTES
            ? "tooLarge"
            : { name: file.name, data: original, ...size };
    }
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));
    const bitmap = await createImageBitmap(file, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
        premultiplyAlpha: "none",
    });
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const data = new Uint8Array(await blob.arrayBuffer());
    if (data.length > SILK_ARTWORK_MAX_BYTES) return "tooLarge";
    return { name: file.name, data, width, height };
}

/** An object URL for the stored PNG, revoked when it changes or unmounts. */
function usePngUrl(data: Uint8Array | undefined): string | null {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!data) {
            setUrl(null);
            return;
        }
        const next = URL.createObjectURL(
            new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/png" }),
        );
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [data]);
    return url;
}

export function SilkArtworkControls() {
    const { t } = useTranslate();
    const { settings } = useVenueRequest();
    const shape = silkShapeOf(settings?.silkShape);
    const { data: artwork } = useQuery(
        silkArtworkQueryOptions(settings?.silkArtwork),
    );
    const input = useRef<HTMLInputElement>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [busy, setBusy] = useState<TemplateFormat | null>(null);

    // the stored PNG as a picture beside its name
    const preview = usePngUrl(artwork?.data);

    const onPick = async (file: File | undefined) => {
        if (!file) return;
        setProblem(null);
        try {
            const result = await readArtwork(file);
            if (result === "notPng") setProblem(t("view3d.silkArtwork.notPng"));
            else if (result === "tooLarge")
                setProblem(t("view3d.silkArtwork.tooLarge"));
            else window.view3d.requestSilkArtwork(result);
        } catch (error) {
            console.warn("3D View: couldn't read the picked PNG", error);
            setProblem(t("view3d.silkArtwork.unreadable"));
        }
    };

    const download = async (format: TemplateFormat) => {
        setBusy(format);
        // let the busy label paint before the PNG is drawn
        await new Promise((resolve) => setTimeout(resolve, 30));
        try {
            const file = await artworkTemplateFile(
                silkShapeSurface(silkShape(shape)),
                format,
                deflate,
            );
            saveFile(file.name, file.mimeType, file.data);
        } catch (error) {
            console.error("3D View: couldn't make the template", error);
            setProblem(t("view3d.silkArtwork.templateFailed"));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex flex-col gap-8" data-testid="view3d-silk-artwork">
            {artwork && preview ? (
                <div className="flex items-center gap-8">
                    <img
                        src={preview}
                        alt=""
                        className="border-stroke rounded-4 h-40 max-w-80 border object-contain"
                    />
                    <span
                        className="text-sub min-w-0 truncate"
                        title={artwork.name}
                        data-testid="view3d-silk-artwork-name"
                    >
                        {artwork.name}
                    </span>
                </div>
            ) : (
                <p className="text-sub text-text/60">
                    {t("view3d.silkArtwork.none")}
                </p>
            )}
            <div className="flex flex-wrap gap-6">
                <Button
                    variant="secondary"
                    size="compact"
                    data-testid="view3d-silk-artwork-import"
                    onClick={() => input.current?.click()}
                >
                    {artwork
                        ? t("view3d.silkArtwork.replace")
                        : t("view3d.silkArtwork.import")}
                </Button>
                {artwork && (
                    <Button
                        variant="secondary"
                        size="compact"
                        data-testid="view3d-silk-artwork-remove"
                        onClick={() => window.view3d.requestSilkArtwork(null)}
                    >
                        {t("view3d.silkArtwork.remove")}
                    </Button>
                )}
                <input
                    ref={input}
                    type="file"
                    accept="image/png"
                    className="hidden"
                    data-testid="view3d-silk-artwork-file"
                    onChange={(e) => {
                        void onPick(e.target.files?.[0]);
                        e.target.value = "";
                    }}
                />
            </div>
            <div className="flex flex-wrap items-center gap-6">
                <span className="text-sub text-text/60">
                    {t("view3d.silkArtwork.template", {
                        shape: t(`view3d.silkShape.${shape}`),
                    })}
                </span>
                {FORMATS.map((format) => (
                    <Button
                        key={format}
                        variant="secondary"
                        size="compact"
                        disabled={busy !== null}
                        data-testid={`view3d-silk-template-${format}`}
                        onClick={() => void download(format)}
                    >
                        {busy === format
                            ? t("view3d.silkArtwork.preparing")
                            : format.toUpperCase()}
                    </Button>
                ))}
            </div>
            {problem && (
                <p className="text-sub text-red" role="alert">
                    {problem}
                </p>
            )}
        </div>
    );
}
