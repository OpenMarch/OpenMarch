import AudioSelector from "./AudioSelector";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { XIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { TempoGroup } from "@/global/classes/TempoGroup";

export default function MusicModal() {
    return (
        <SidebarModalLauncher
            contents={<MusicModalContents />}
            buttonLabel="Music"
        />
    );
}
function MusicModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    return (
        <div className="animate-scale-in text-text flex w-fit flex-col gap-16">
            <header className="flex justify-between gap-24">
                <h4 className="text-h4 leading-none">Music</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>
            {/* <div id="measure editing container">
                <MeasureEditor />
                </div> */}
            <div className="flex flex-col gap-16">
                <AudioSelector />
            </div>
            <h4 className="text-h4 leading-none">Tempo Groups</h4>
            <div id="tempo-groups" className="mx-12 flex flex-col gap-8">
                {testTempoGroups.map((tempoGroup, i) => (
                    <TempoGroupCard key={i} tempoGroup={tempoGroup} />
                ))}
            </div>
        </div>
    );
}

// Example tempo groups for testing
export const testTempoGroups: TempoGroup[] = [
    // Simple 4/4 tempo group
    {
        name: " ",
        startTempo: 120,
        bigBeatsPerMeasure: 4,
        numOfRepeats: 8,
    },

    // Mixed meter 7/8 with long beat at the end (2+2+3)
    {
        name: "-",
        startTempo: 144,
        bigBeatsPerMeasure: 3,
        longBeatIndexes: [2],
        numOfRepeats: 4,
        measureRangeString: "m 1-4",
    },

    // Mixed meter 7/8 with long beat at the beginning (3+2+2)
    {
        name: "A",
        startTempo: 132,
        bigBeatsPerMeasure: 3,
        longBeatIndexes: [0],
        numOfRepeats: 6,
        measureRangeString: "m 5-10",
    },

    // Group with manual tempos (accelerando)
    {
        name: "",
        startTempo: 100,
        manualTempos: [
            100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122,
        ],
        bigBeatsPerMeasure: 4,
        numOfRepeats: 3,
        measureRangeString: "m 11-13",
    },

    // Mixed meter 10/8 with alternating long beats (3+2+3+2)
    {
        name: "B",
        startTempo: 138,
        bigBeatsPerMeasure: 4,
        longBeatIndexes: [0, 2],
        numOfRepeats: 5,
    },

    // Group with very slow tempo
    {
        name: "",
        startTempo: 72,
        bigBeatsPerMeasure: 4,
        numOfRepeats: 8,
    },

    // Mixed meter 8/8 with two long beats (3+3+2)
    {
        name: "C",
        startTempo: 126,
        bigBeatsPerMeasure: 3,
        longBeatIndexes: [0, 1],
        numOfRepeats: 4,
    },

    // Group with very fast tempo
    {
        name: "",
        startTempo: 176,
        bigBeatsPerMeasure: 4,
        numOfRepeats: 12,
    },
    // Group with very fast tempo
    {
        name: "",
        startTempo: 200,
        bigBeatsPerMeasure: 4,
        numOfRepeats: 12,
    },
];

function TempoGroupCard({ tempoGroup }: { tempoGroup: TempoGroup }) {
    const trimmedName = tempoGroup.name.trim();
    return (
        <>
            {tempoGroup.name && trimmedName !== "" && trimmedName !== "-" && (
                <div className="bg-fg-2 border-accent rounded-6 mt-12 flex w-fit min-w-32 border px-8 py-4">
                    <h3 className="text-text-secondary text-h3">
                        {trimmedName}
                    </h3>
                </div>
            )}
            <div
                className={`bg-fg-2 border-stroke rounded-tr-6 rounded-b-6 rounded-6 flex max-w-6 justify-between border p-12`}
            >
                <div className="flex flex-col gap-8">
                    <div>
                        <h3 className="text-h3">
                            {tempoGroup.startTempo}{" "}
                            <span className="text-text/60 text-sm">bpm</span>
                        </h3>
                    </div>
                    {tempoGroup.measureRangeString && (
                        <p className="text-text/60 text-sm">
                            {tempoGroup.measureRangeString}
                        </p>
                    )}
                </div>
                <div className="flex flex-col items-end justify-between">
                    <h4 className="text-h4">
                        {tempoGroup.bigBeatsPerMeasure}/4
                    </h4>
                    <p className="text-right">{tempoGroup.numOfRepeats}x</p>
                </div>
            </div>
        </>
    );
}
