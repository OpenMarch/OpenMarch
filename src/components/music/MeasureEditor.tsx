import BeatUnit from "@/global/classes/BeatUnit";
import Measure from "@/global/classes/Measure";
import TimeSignature from "@/global/classes/TimeSignature";
import { useMeasureStore } from "@/stores/measure/useMeasureStore";
import { useCallback, useEffect, useRef, useState } from "react";

export default function MeasureEditor() {
    const [selectedMeasure, setSelectedMeasure] = useState<Measure>();
    const { measures } = useMeasureStore()!;
    const formRef = useRef<HTMLFormElement>(null);
    const [timeSignatureNumerator, setTimeSignatureNumerator] =
        useState<number>(4);
    const [timeSignatureDenominator, setTimeSignatureDenominator] =
        useState<(typeof TimeSignature.validDenominators)[number]>(4);
    const [beatUnit, setBeatUnit] = useState<BeatUnit>(BeatUnit.QUARTER);
    const [tempoBpm, setTempoBpm] = useState(120);
    const [hasChanged, setHasChanged] = useState(false);

    const handleSubmit = useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            if (selectedMeasure) {
                const newMeasure: Measure = new Measure({
                    ...selectedMeasure,
                    timeSignature: new TimeSignature({
                        numerator: timeSignatureNumerator,
                        denominator: timeSignatureDenominator,
                    }),
                    beatUnit: beatUnit,
                    tempo: tempoBpm,
                });
                Measure.updateMeasure({
                    modifiedMeasure: newMeasure,
                    existingMeasures: measures,
                });
            }
        },
        [
            beatUnit,
            measures,
            selectedMeasure,
            tempoBpm,
            timeSignatureDenominator,
            timeSignatureNumerator,
        ]
    );

    const resetForm = useCallback(() => {
        if (selectedMeasure) {
            setTimeSignatureNumerator(selectedMeasure.timeSignature.numerator);
            setTimeSignatureDenominator(
                selectedMeasure.timeSignature.denominator
            );
            setBeatUnit(selectedMeasure.beatUnit);
            setTempoBpm(selectedMeasure.tempo);
        }
    }, [selectedMeasure]);

    // Check if any of the form values are different than the initial value
    useEffect(() => {
        if (
            selectedMeasure &&
            selectedMeasure.timeSignature.numerator ===
                timeSignatureNumerator &&
            selectedMeasure.timeSignature.denominator ===
                timeSignatureDenominator &&
            selectedMeasure.tempo === tempoBpm &&
            selectedMeasure.beatUnit === beatUnit
        )
            setHasChanged(false);
        else setHasChanged(true);
    }, [
        timeSignatureNumerator,
        timeSignatureDenominator,
        beatUnit,
        tempoBpm,
        selectedMeasure,
    ]);

    // Set initial selected measure to measure 1
    useEffect(() => {
        if (measures.length > 0) {
            setSelectedMeasure(measures[0]);
        }
    }, [measures, setSelectedMeasure]);

    useEffect(() => {
        resetForm();
    }, [resetForm, selectedMeasure]);

    return (
        <div>
            <div
                id="measures-container"
                className="border-solid border-gray-400 p-4 max-h-32 overflow-y-scroll grid grid-cols-8 gap-2 rounded"
            >
                {measures.map((measure) => (
                    <div
                        className={`transition-all select-none cursor-pointer px-2 py-1 rounded ${
                            measure.number === selectedMeasure?.number
                                ? "bg-purple-600 text-white hover:bg-purple-700"
                                : "hover:bg-gray-300"
                        }`}
                        key={measure.number}
                        onClick={() => setSelectedMeasure(measure)}
                    >
                        {measure.number}
                    </div>
                ))}
            </div>
            {selectedMeasure && (
                <form
                    ref={formRef}
                    id="Edit measure form"
                    onSubmit={handleSubmit}
                >
                    {selectedMeasure && (
                        <div id="edit measure form">
                            <h3 className="text-xl font-bold">
                                Measure {selectedMeasure.number}
                            </h3>
                            <div className="flex gap-4">
                                <div id="edit time signature container">
                                    <h4 className="text-lg mt-0 mb-1">
                                        Time Signature
                                    </h4>
                                    <div
                                        className="w-[60%] m-4 flex flex-col gap-2"
                                        id="time signature container"
                                    >
                                        <div
                                            id="numerator container"
                                            className="flex"
                                        >
                                            <label
                                                htmlFor="measure-time-signature-numerator"
                                                className="text-md mr-4"
                                            >
                                                Numerator
                                            </label>
                                            <input
                                                type="number"
                                                id="measure-time-signature-numerator"
                                                className="w-full pl-2"
                                                min={1}
                                                required
                                                step={1}
                                                value={timeSignatureNumerator}
                                                onChange={(e) =>
                                                    setTimeSignatureNumerator(
                                                        e.currentTarget
                                                            .valueAsNumber
                                                    )
                                                }
                                            />
                                        </div>
                                        <div
                                            id="numerator container"
                                            className="flex"
                                        >
                                            <label
                                                htmlFor="measure-time-signature-denominator"
                                                className="text-md mr-4"
                                            >
                                                Denominator
                                            </label>
                                            <select
                                                id="measure-time-signature-denominator"
                                                value={timeSignatureDenominator.toString()}
                                                className="w-full pl-2"
                                                onChange={(e) =>
                                                    setTimeSignatureDenominator(
                                                        parseInt(
                                                            e.currentTarget
                                                                .value
                                                        ) as (typeof TimeSignature.validDenominators)[number]
                                                    )
                                                }
                                            >
                                                {TimeSignature.validDenominators.map(
                                                    (denominator) => (
                                                        <option
                                                            key={denominator}
                                                            value={denominator}
                                                        >
                                                            {denominator}
                                                        </option>
                                                    )
                                                )}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div id="edit tempo container">
                                    <h4 className="text-lg mt-0 mb-1">Tempo</h4>
                                    <div
                                        className="w-fit m-4 flex flex-col gap-2"
                                        id="time signature container"
                                    >
                                        <div
                                            id="beat unit container"
                                            className="flex"
                                        >
                                            <label
                                                htmlFor="measure-tempo-beat-unit"
                                                className="text-md mr-4"
                                            >
                                                Beat Unit
                                            </label>
                                            <select
                                                id="measure-tempo-beat-unit"
                                                value={beatUnit.toString()}
                                                className="flex-grow"
                                                onChange={(e) =>
                                                    setBeatUnit(
                                                        BeatUnit.fromName(
                                                            e.currentTarget
                                                                .value
                                                        )
                                                    )
                                                }
                                            >
                                                {BeatUnit.ALL.map(
                                                    (beatUnit) => (
                                                        <option
                                                            key={beatUnit.name}
                                                            value={
                                                                beatUnit.name
                                                            }
                                                        >
                                                            {beatUnit.name}
                                                        </option>
                                                    )
                                                )}
                                            </select>
                                        </div>
                                        <div
                                            id="bpm container"
                                            className="flex"
                                        >
                                            <label
                                                htmlFor="measure-tempo-bpm"
                                                className="text-md mr-4"
                                            >
                                                BPM
                                            </label>
                                            <input
                                                required
                                                type="number"
                                                id="measure-tempo-bpm"
                                                className="flex-grow"
                                                value={tempoBpm}
                                                onChange={(e) => {
                                                    setTempoBpm(
                                                        e.currentTarget
                                                            .valueAsNumber
                                                    );
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <div className="flex-grow" />
                        <button
                            disabled={!hasChanged}
                            type="button"
                            className="btn-secondary"
                            onClick={resetForm}
                        >
                            Cancel
                        </button>
                        <button
                            disabled={!hasChanged}
                            type="submit"
                            className="btn-primary"
                        >
                            Save Changes to m{selectedMeasure.number}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
