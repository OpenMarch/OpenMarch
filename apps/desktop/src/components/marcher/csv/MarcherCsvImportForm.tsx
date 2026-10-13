import { useMemo, useRef, useState } from "react";
import { T, useTolgee } from "@tolgee/react";
import clsx from "clsx";
import { Button, InfoNote, ToggleGroup, ToggleGroupItem } from "@openmarch/ui";
import {
    CheckCircleIcon,
    CheckIcon,
    CopyIcon,
    DownloadSimpleIcon,
    FileCsvIcon,
    UploadSimpleIcon,
    WarningIcon,
    XCircleIcon,
} from "@phosphor-icons/react";
import type { NewMarcherArgs } from "@/db-functions";
import {
    MARCHER_CSV_COLUMNS,
    exampleMarcherCsv,
    planMarcherCsv,
    sectionPrefixTable,
    type ExistingDrillNumber,
    type MarcherCsvMode,
} from "./marcherCsv";

/** `File.text()` is missing in some environments (jsdom), so read through FileReader */
const readText = (f: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(f);
    });

function downloadExample(mode: MarcherCsvMode) {
    const blob = new Blob([exampleMarcherCsv(mode)], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
        mode === "section"
            ? "marchers-by-section.csv"
            : "marchers-by-drill-number.csv";
    a.click();
    URL.revokeObjectURL(url);
}

interface MarcherCsvImportFormProps {
    existing: ExistingDrillNumber[];
    /** Extra reason to keep Import disabled, such as marchers still loading */
    importDisabled?: boolean;
    onImport: (marchers: NewMarcherArgs[]) => void;
    /** Drop the chosen file after import so the same rows are not added twice */
    resetAfterImport?: boolean;
    showInfoNote?: boolean;
    className?: string;
}

export default function MarcherCsvImportForm({
    existing,
    importDisabled = false,
    onImport,
    resetAfterImport = false,
    showInfoNote = false,
    className,
}: MarcherCsvImportFormProps) {
    const { t } = useTolgee();
    const fileInput = useRef<HTMLInputElement>(null);
    const readGeneration = useRef(0);
    const [mode, setMode] = useState<MarcherCsvMode>("section");
    const [file, setFile] = useState<{ name: string; text: string }>();
    const [readError, setReadError] = useState(false);
    const [copied, setCopied] = useState(false);

    const plan = useMemo(
        () => (file ? planMarcherCsv(file.text, mode, existing) : undefined),
        [file, mode, existing],
    );
    const valid = plan?.rows.filter((r) => r.marcher) ?? [];
    const invalid = plan?.rows.filter((r) => r.error) ?? [];
    const sections = useMemo(sectionPrefixTable, []);

    const onFile = async (f: File | undefined) => {
        if (!f) return;
        const request = ++readGeneration.current;
        setReadError(false);
        setFile(undefined);
        try {
            const text = await readText(f);
            if (readGeneration.current !== request) return;
            setFile({ name: f.name, text });
        } catch {
            if (readGeneration.current !== request) return;
            setReadError(true);
            setFile(undefined);
        }
    };

    const handleImport = () => {
        onImport(valid.map((r) => r.marcher!));
        if (resetAfterImport) setFile(undefined);
    };

    const copySections = () => {
        const text = [
            [t("marchers.section"), t("marchers.drillPrefix")],
            ...sections.map((s) => [t(s.tName), s.prefix]),
        ]
            .map((row) => row.join("\t"))
            .join("\n");
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const errorText = (code: string, value?: string) =>
        t(`marchers.csv.error.${code}`, { value: value ?? "" });

    return (
        <div className={clsx("flex flex-col gap-16", className)}>
            <div className="flex flex-col gap-8">
                <ToggleGroup
                    type="single"
                    value={mode}
                    onValueChange={(m) => m && setMode(m as MarcherCsvMode)}
                    aria-label={t("marchers.csv.title")}
                    className="w-full"
                >
                    {(["section", "drillNumber"] as const).map((m) => (
                        <ToggleGroupItem
                            key={m}
                            value={m}
                            className="text-body flex-1"
                        >
                            <T keyName={`marchers.csv.mode.${m}.title`} />
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
                <p className="text-sub text-text/70">
                    <T keyName={`marchers.csv.mode.${mode}.help`} />
                </p>
                <div className="flex flex-wrap gap-4">
                    {MARCHER_CSV_COLUMNS[mode].map((column) => (
                        <code
                            key={column}
                            className="bg-fg-2 border-stroke rounded-6 text-sub border px-6 py-2"
                        >
                            {column}
                        </code>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap gap-8">
                <Button
                    variant="secondary"
                    size="compact"
                    className="flex-1 whitespace-nowrap"
                    onClick={() => downloadExample(mode)}
                >
                    <DownloadSimpleIcon size={18} />
                    <T keyName="marchers.csv.downloadExample" />
                </Button>
                <Button
                    size="compact"
                    className="flex-1 whitespace-nowrap"
                    onClick={() => fileInput.current?.click()}
                >
                    <UploadSimpleIcon size={18} />
                    <T keyName="marchers.csv.chooseFile" />
                </Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    aria-label="Marcher CSV file"
                    onChange={(e) => {
                        void onFile(e.target.files?.[0]);
                        e.target.value = "";
                    }}
                />
            </div>

            <details className="text-sub">
                <summary className="cursor-pointer">
                    <T keyName="marchers.csv.sections" />
                </summary>
                <div className="my-8 flex items-start gap-8">
                    <p className="text-text/70 flex-1">
                        <T keyName="marchers.csv.sectionsHelp" />
                    </p>
                    <Button
                        variant="secondary"
                        size="compact"
                        className="whitespace-nowrap"
                        onClick={copySections}
                    >
                        {copied ? (
                            <CheckIcon size={16} />
                        ) : (
                            <CopyIcon size={16} />
                        )}
                        <T keyName="marchers.csv.copySections" />
                    </Button>
                </div>
                <table className="w-full text-left">
                    <thead>
                        <tr>
                            <th>
                                <T keyName="marchers.section" />
                            </th>
                            <th>
                                <T keyName="marchers.drillPrefix" />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sections.map((s) => (
                            <tr key={s.name}>
                                <td>{t(s.tName)}</td>
                                <td>
                                    <code>{s.prefix}</code>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </details>

            {readError && (
                <p className="text-red text-sub">
                    <T keyName="marchers.csv.readError" />
                </p>
            )}

            {file && plan && (
                <div className="flex flex-col gap-8">
                    <p className="text-sub text-text/70 flex items-center gap-4">
                        <FileCsvIcon size={16} />
                        {file.name}
                    </p>
                    {plan.missingColumns.length > 0 ? (
                        <p className="text-body text-red flex items-center gap-6">
                            <XCircleIcon size={20} className="shrink-0" />
                            {t("marchers.csv.missingColumns", {
                                columns: plan.missingColumns.join(", "),
                            })}
                        </p>
                    ) : valid.length === 0 ? (
                        <p className="text-body text-red flex items-center gap-6">
                            <XCircleIcon size={20} className="shrink-0" />
                            {invalid.length > 0
                                ? t("marchers.csv.result.failed")
                                : t("marchers.csv.result.empty")}
                        </p>
                    ) : invalid.length > 0 ? (
                        <p className="text-body flex items-center gap-6">
                            <WarningIcon
                                size={20}
                                className="text-yellow shrink-0"
                            />
                            {t("marchers.csv.result.partial", {
                                valid: valid.length,
                                invalid: invalid.length,
                            })}
                        </p>
                    ) : (
                        <p className="text-body flex items-center gap-6">
                            <CheckCircleIcon
                                size={20}
                                className="text-green shrink-0"
                            />
                            {t("marchers.csv.result.success", {
                                valid: valid.length,
                            })}
                        </p>
                    )}
                    {invalid.length > 0 && (
                        <ul className="text-red text-sub bg-fg-2 border-stroke rounded-6 flex max-h-[8rem] flex-col gap-2 overflow-y-auto border px-8 py-6">
                            {invalid.map((r) => (
                                <li key={r.line}>
                                    {t("marchers.csv.line", { line: r.line })}:{" "}
                                    {errorText(r.error!.code, r.error!.value)}
                                </li>
                            ))}
                        </ul>
                    )}
                    {plan.ignoredColumns.length > 0 && (
                        <p className="text-text/70 text-sub">
                            {t("marchers.csv.ignoredColumns", {
                                columns: plan.ignoredColumns.join(", "),
                            })}
                        </p>
                    )}
                    {valid.length > 0 && (
                        <div className="border-stroke rounded-6 max-h-[16rem] overflow-y-auto border">
                            <table className="text-sub w-full text-left [&_td]:px-8 [&_td]:py-2 [&_th]:px-8 [&_th]:py-4">
                                <thead className="bg-bg-1 bg-fg-2 sticky top-0 z-10">
                                    <tr>
                                        <th>#</th>
                                        <th>
                                            <T keyName="marchers.section" />
                                        </th>
                                        <th>
                                            <T keyName="marchers.name" />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {valid.map((r) => (
                                        <tr key={r.line}>
                                            <td>
                                                {r.marcher!.drill_prefix}
                                                {r.marcher!.drill_order}
                                            </td>
                                            <td>{r.marcher!.section}</td>
                                            <td>{r.marcher!.name ?? "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <Button
                className="w-full"
                disabled={importDisabled || valid.length === 0}
                onClick={handleImport}
            >
                {t("marchers.csv.importButton", { count: valid.length })}
            </Button>
            {showInfoNote && (
                <InfoNote>
                    <T keyName="marchers.csv.info" />
                </InfoNote>
            )}
        </div>
    );
}
