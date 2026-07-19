import { useRef, useState } from "react";
import { Button } from "@openmarch/ui";
import {
    CheckCircleIcon,
    CircleIcon,
    DownloadSimpleIcon,
    SpinnerIcon,
    XIcon,
} from "@phosphor-icons/react";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import {
    DRILL_IMPORT_STEPS,
    DRILL_IMPORT_STEP_LABELS,
    useImportDrillPackage,
    type DrillImportResult,
    type DrillImportStep,
} from "./DrillImport";

export default function ImportModal({
    label = <DownloadSimpleIcon size={24} />,
    buttonClassName,
}: {
    label?: string | React.ReactNode;
    buttonClassName?: string;
}) {
    return (
        <SidebarModalLauncher
            contents={<ImportModalContents />}
            newContentId="import"
            buttonLabel={label}
            className={buttonClassName}
        />
    );
}

function ImportModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importDrill = useImportDrillPackage();
    const [activeStep, setActiveStep] = useState<DrillImportStep | null>(null);
    const [result, setResult] = useState<DrillImportResult | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (!file) return;

        setResult(null);
        setActiveStep(null);
        try {
            const imported = await importDrill.mutateAsync({
                file,
                onProgress: setActiveStep,
            });
            setResult(imported);
        } catch {
            // useImportDrillPackage.onError already toasts.
            setActiveStep(null);
        }
    };

    const isImporting = importDrill.isPending;
    const isDone = result !== null;

    return (
        <div className="animate-scale-in text-text flex h-full w-[28rem] flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Import</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            {isImporting || isDone ? (
                <ImportProgress activeStep={activeStep} result={result} />
            ) : (
                <div className="flex flex-col gap-12">
                    <p className="text-body text-text/80">
                        Import a drill file to build the show. This replaces the
                        current marchers, sets, and coordinates, and imports the
                        bundled audio.
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".3dz"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <Button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-fit"
                    >
                        Choose drill file
                    </Button>
                </div>
            )}
        </div>
    );
}

function ImportProgress({
    activeStep,
    result,
}: {
    activeStep: DrillImportStep | null;
    result: DrillImportResult | null;
}) {
    const { toggleOpen } = useSidebarModalStore();
    const isDone = result !== null;
    const total = DRILL_IMPORT_STEPS.length;
    const activeIndex = activeStep ? DRILL_IMPORT_STEPS.indexOf(activeStep) : 0;
    // Give the in-progress step half credit so the bar visibly advances while a
    // stage runs; a completed import fills it entirely.
    const fraction = isDone ? 1 : Math.min(1, (activeIndex + 0.5) / total);

    return (
        <div className="flex flex-col gap-16">
            <ul className="flex flex-col gap-8">
                {DRILL_IMPORT_STEPS.map((step, index) => {
                    const state = isDone
                        ? "done"
                        : index < activeIndex
                          ? "done"
                          : index === activeIndex
                            ? "active"
                            : "pending";
                    return (
                        <li
                            key={step}
                            className="text-body flex items-center gap-8"
                        >
                            <StepIcon state={state} />
                            <span
                                className={
                                    state === "pending"
                                        ? "text-text-subtitle"
                                        : "text-text"
                                }
                            >
                                {DRILL_IMPORT_STEP_LABELS[step]}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <div className="bg-stroke h-6 w-full overflow-hidden rounded-full">
                <div
                    className="bg-accent h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${fraction * 100}%` }}
                />
            </div>

            {isDone && (
                <div className="flex flex-col gap-12">
                    <p className="text-body text-text/80">
                        {result.message} — {result.marchers} marchers,{" "}
                        {result.sets} sets.
                    </p>
                    <Button onClick={toggleOpen} className="w-fit">
                        Done
                    </Button>
                </div>
            )}
        </div>
    );
}

function StepIcon({ state }: { state: "done" | "active" | "pending" }) {
    if (state === "done")
        return (
            <CheckCircleIcon weight="fill" className="text-green" size={20} />
        );
    if (state === "active")
        return <SpinnerIcon className="text-accent animate-spin" size={20} />;
    return <CircleIcon className="text-text-subtitle" size={20} />;
}
