import { useState, useEffect } from "react";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    Input,
} from "@openmarch/ui";
import { StaticFormField } from "@/components/ui/FormField";
import { T, useTolgee } from "@tolgee/react";
import AudioSelector from "@/components/music/AudioSelector";
import MusicXmlSelector from "@/components/music/MusicXmlSelector";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import { useQuery } from "@tanstack/react-query";
import { allDatabaseMeasuresQueryOptions } from "@/hooks/queries/useMeasures";

export default function MusicStep() {
    const { wizardState, updateMusic } = useGuidedSetupStore();
    const { t } = useTolgee();
    const { selectedAudioFile } = useSelectedAudioFile() || {};
    const { data: measures } = useQuery(allDatabaseMeasuresQueryOptions());
    const [method, setMethod] = useState<"xml" | "mp3" | "tempo_only" | "skip">(
        wizardState?.music?.method || "tempo_only",
    );
    const [tempo, setTempo] = useState<number>(
        wizardState?.music?.tempo || 120,
    );
    const [startCount, setStartCount] = useState<number>(
        wizardState?.music?.startCount || 1,
    );

    // Update wizard state when method changes
    useEffect(() => {
        const newMusicState = {
            method,
            tempo: method === "tempo_only" ? tempo : undefined,
            startCount: method === "tempo_only" ? startCount : undefined,
        };
        updateMusic(newMusicState);
    }, [method, tempo, startCount, updateMusic]);

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
        <div className="flex flex-col gap-16">
            <StaticFormField label={<T keyName="wizard.music.method" />}>
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
            </StaticFormField>

            {method === "tempo_only" && (
                <div className="flex flex-col gap-16">
                    <StaticFormField label={<T keyName="wizard.music.tempo" />}>
                        <Input
                            type="number"
                            value={tempo}
                            onChange={(e) =>
                                setTempo(parseInt(e.target.value) || 120)
                            }
                            min={1}
                            max={300}
                        />
                    </StaticFormField>
                    <StaticFormField
                        label={<T keyName="wizard.music.startCount" />}
                    >
                        <Input
                            type="number"
                            value={startCount}
                            onChange={(e) =>
                                setStartCount(parseInt(e.target.value) || 1)
                            }
                            min={1}
                        />
                    </StaticFormField>
                </div>
            )}

            {method === "mp3" && (
                <div className="mt-8">
                    <AudioSelector />
                </div>
            )}

            {method === "xml" && (
                <div className="mt-8">
                    <MusicXmlSelector />
                </div>
            )}

            {method === "skip" && (
                <p className="text-body text-text/60">
                    <T keyName="wizard.music.skipDescription" />
                </p>
            )}
        </div>
    );
}
