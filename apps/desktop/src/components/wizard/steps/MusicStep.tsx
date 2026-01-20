import { useState, useEffect } from "react";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    Input,
    WarningNote,
} from "@openmarch/ui";
import { WizardFormField } from "@/components/ui/FormField";
import { T, useTolgee } from "@tolgee/react";
import AudioSelector from "@/components/music/AudioSelector";
import MusicXmlSelector from "@/components/music/MusicXmlSelector";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import { useQuery } from "@tanstack/react-query";
import { allDatabaseMeasuresQueryOptions } from "@/hooks/queries/useMeasures";

export default function MusicStep() {
    const wizardState = useGuidedSetupStore((state) => state.wizardState);
    const updateMusic = useGuidedSetupStore((state) => state.updateMusic);
    const { t } = useTolgee();
    const { selectedAudioFile } = useSelectedAudioFile() || {};
    const [databaseReady, setDatabaseReady] = useState(false);
    const [checkingDatabase, setCheckingDatabase] = useState(true);
    const { data: measures } = useQuery({
        ...allDatabaseMeasuresQueryOptions(),
        enabled: databaseReady,
    });

    // Check if database is ready before allowing uploads
    // Poll until database is ready (in case it's still being created in ProjectStep)
    useEffect(() => {
        let cancelled = false;
        const checkDatabase = async () => {
            setCheckingDatabase(true);
            // Poll up to 10 times with 500ms delay between checks
            for (let i = 0; i < 10; i++) {
                if (cancelled) return;
                const ready = await window.electron.databaseIsReady();
                if (ready) {
                    setDatabaseReady(true);
                    setCheckingDatabase(false);
                    return;
                }
                // Wait 500ms before checking again
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            // If we get here, database still isn't ready after 5 seconds
            setDatabaseReady(false);
            setCheckingDatabase(false);
        };
        void checkDatabase();
        return () => {
            cancelled = true;
        };
    }, []);
    const [method, setMethod] = useState<"xml" | "mp3" | "tempo_only" | "skip">(
        wizardState?.music?.method || "tempo_only",
    );
    const [tempo, setTempo] = useState<number>(
        wizardState?.music?.tempo || 120,
    );

    // Update wizard state when method changes
    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            const newMusicState = {
                method,
                tempo: method === "tempo_only" ? tempo : undefined,
            };
            updateMusic(newMusicState);
        }, 200);

        return () => window.clearTimeout(timeoutId);
    }, [method, tempo, updateMusic]);

    // Update wizard state when audio file is selected (for mp3 method)
    useEffect(() => {
        if (method === "mp3" && selectedAudioFile) {
            updateMusic({ method: "mp3" });
        }
    }, [method, selectedAudioFile, updateMusic]);

    // Update wizard state when measures exist (for xml method)
    useEffect(() => {
        if (
            method === "xml" &&
            measures &&
            Array.isArray(measures) &&
            measures.length > 0
        ) {
            updateMusic({ method: "xml" });
        }
    }, [method, measures, updateMusic]);

    const getMethodLabel = () => {
        switch (method) {
            case "tempo_only":
                return t("wizard.music.tempoOnly");
            case "xml":
                return t("wizard.music.musicXml");
            case "mp3":
                return t("wizard.music.audioFile");
            case "skip":
                return t("wizard.music.skip");
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-32">
            <WizardFormField
                label={<T keyName="wizard.music.method" />}
                helperText={<T keyName="wizard.music.methodHelper" />}
            >
                <Select
                    value={method}
                    onValueChange={(value) => setMethod(value as typeof method)}
                >
                    <SelectTriggerButton label={getMethodLabel()} />
                    <SelectContent>
                        <SelectItem value="tempo_only">
                            <T keyName="wizard.music.tempoOnly" />
                        </SelectItem>
                        <SelectItem value="xml">
                            <T keyName="wizard.music.musicXml" />
                        </SelectItem>
                        <SelectItem value="mp3">
                            <T keyName="wizard.music.audioFile" />
                        </SelectItem>
                        <SelectItem value="skip">
                            <T keyName="wizard.music.skip" />
                        </SelectItem>
                    </SelectContent>
                </Select>
            </WizardFormField>

            {method === "tempo_only" && (
                <div className="flex flex-col gap-24">
                    <WizardFormField
                        label={<T keyName="wizard.music.tempo" />}
                        helperText={<T keyName="wizard.music.tempoHelper" />}
                    >
                        <Input
                            type="number"
                            value={tempo}
                            onChange={(e) =>
                                setTempo(parseInt(e.target.value) || 120)
                            }
                            min={1}
                            max={300}
                            className="w-full"
                        />
                    </WizardFormField>
                </div>
            )}

            {method === "mp3" && (
                <div className="flex flex-col gap-16">
                    {checkingDatabase && (
                        <WarningNote>
                            Waiting for database to be ready...
                        </WarningNote>
                    )}
                    {!checkingDatabase && !databaseReady && (
                        <WarningNote>
                            Database is not ready. Please go back to the Project
                            step and ensure the project name and file location
                            are set, then return to this step.
                        </WarningNote>
                    )}
                    {databaseReady && <AudioSelector />}
                </div>
            )}

            {method === "xml" && (
                <div className="flex flex-col gap-16">
                    {checkingDatabase && (
                        <WarningNote>
                            Waiting for database to be ready...
                        </WarningNote>
                    )}
                    {!checkingDatabase && !databaseReady && (
                        <WarningNote>
                            Database is not ready. Please go back to the Project
                            step and ensure the project name and file location
                            are set, then return to this step.
                        </WarningNote>
                    )}
                    {databaseReady && <MusicXmlSelector />}
                </div>
            )}

            {method === "skip" && (
                <div className="rounded-12 bg-fg-1 border-stroke border p-20">
                    <p className="text-body text-text/80 leading-relaxed">
                        <T keyName="wizard.music.skipDescription" />
                    </p>
                </div>
            )}
        </div>
    );
}
