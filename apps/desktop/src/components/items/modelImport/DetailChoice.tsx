/**
 * The import review's detail level (fork #1091): Light (pre-selected), Detailed or Original, with
 * what each choice costs in the show's own terms (the bytes it adds to the show file, and how many
 * performers one copy is as heavy to draw as), an honest warning above Light, and a 3D comparison
 * with the Original (or, at Original, with the Light copy kept beside it).
 */
import { lazy, Suspense, useState } from "react";
import { CubeIcon, InfoIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    SegmentedTextSwitch,
} from "@openmarch/ui";
import { useSizeText } from "@/components/assets/AssetsView";
import { useModelImportSession } from "@/showAssets/modelImport/review/modelImportSession";
import { PERFORMER_TRIANGLES } from "@/showAssets/modelImport/rules";
import type {
    Choice,
    DetailLevel,
    ImportedModel,
} from "@/showAssets/modelImport/types";
import type { CompareVersion } from "./ModelCompareView";

const ModelCompareView = lazy(() => import("./ModelCompareView"));

type DetailRow = Extract<Choice, { code: "detail" }>;

/** How many performers one copy is about as heavy to draw as: at least 1 */
export const performersLike = (triangles: number): number =>
    Math.max(1, Math.round(triangles / PERFORMER_TRIANGLES));

/** What a stored model adds to the show: every part */
export const modelBytes = (model: ImportedModel): number =>
    Object.values(model.parts).reduce(
        (n, part) => n + (part?.byteLength ?? 0),
        0,
    );

export default function DetailChoice({
    row,
    model,
    running,
}: {
    row: DetailRow;
    model: ImportedModel;
    running: boolean;
}) {
    const { t } = useTranslate();
    const session = useModelImportSession();
    const sizeText = useSizeText();
    const [comparing, setComparing] = useState(false);
    const level = session.choices.detail ?? row.applied;

    const label = (l: DetailLevel) => t(`props.import.detail.levels.${l}`);
    const before = session.before;
    const versions: CompareVersion[] =
        row.applied === "original"
            ? [
                  {
                      key: "chosen",
                      label: label("original"),
                      bytes: model.parts.model,
                      testId: "model-compare-chosen",
                  },
                  {
                      key: "other",
                      label: t("props.import.compare.lightCopy"),
                      bytes: model.parts.light ?? null,
                      testId: "model-compare-other",
                  },
              ]
            : [
                  {
                      key: "chosen",
                      label: label(row.applied),
                      bytes: model.parts.model,
                      testId: "model-compare-chosen",
                  },
                  {
                      key: "other",
                      label: label("original"),
                      bytes: before?.status === "ready" ? before.model : null,
                      failed: before?.status === "failed",
                      testId: "model-compare-other",
                  },
              ];

    return (
        <section
            className="flex flex-col gap-8"
            data-testid="model-import-detail"
        >
            <h5 className="text-text/70 text-body font-medium">
                <T keyName="props.import.detail.title" />
            </h5>
            <SegmentedTextSwitch
                className="self-start"
                ariaLabel={t("props.import.detail.title")}
                selected={level}
                setSelected={(value) =>
                    !running && session.choose({ detail: value as DetailLevel })
                }
                options={row.levels.map((l) => ({
                    value: l,
                    label: label(l),
                    testId: `model-import-detail-${l}`,
                }))}
            />
            <p
                className="text-sub text-text-subtitle"
                data-testid="model-import-detail-cost"
            >
                <T
                    keyName="props.import.detail.cost"
                    params={{
                        triangles: row.appliedTriangles.toLocaleString(),
                        size: sizeText(modelBytes(model)),
                        performers: performersLike(row.appliedTriangles),
                    }}
                />
            </p>
            {row.applied !== "light" && (
                <p
                    className="text-sub text-text-subtitle flex gap-6"
                    data-testid="model-import-detail-warning"
                >
                    <InfoIcon size={16} className="mt-2 shrink-0" />
                    <T keyName="props.import.detail.heavy" />
                </p>
            )}
            <Button
                size="compact"
                variant="secondary"
                className="self-start"
                disabled={running}
                data-testid="model-import-compare"
                onClick={() => {
                    if (row.applied !== "original") session.loadBefore();
                    setComparing(true);
                }}
            >
                <CubeIcon size={16} />
                <T keyName="props.import.compare.open" />
            </Button>
            <Dialog open={comparing} onOpenChange={setComparing}>
                <DialogContent className="w-[min(44rem,90vw)]">
                    <DialogTitle>{t("props.import.compare.title")}</DialogTitle>
                    <DialogDescription>
                        {t("props.import.compare.description")}
                    </DialogDescription>
                    {comparing && (
                        <Suspense fallback={null}>
                            <ModelCompareView versions={versions} />
                        </Suspense>
                    )}
                </DialogContent>
            </Dialog>
        </section>
    );
}
