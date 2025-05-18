// import BeatUnit from "@/global/classes/BeatUnit";
// import Measure from "@/global/classes/Measure";
// import TimeSignature from "@/global/classes/TimeSignature";
// import { useCallback, useEffect, useRef, useState } from "react";
// import * as Tooltip from "@radix-ui/react-tooltip";
// import { Info } from "@phosphor-icons/react";
// import {
//     Select,
//     SelectItem,
//     SelectContent,
//     SelectTriggerButton,
// } from "../ui/Select";
// import { Button } from "../ui/Button";
// import { Input } from "../ui/Input";
// import * as Form from "@radix-ui/react-form";
// import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
// import RegisteredActionButton from "../RegisteredActionButton";
// import {
//     AlertDialog,
//     AlertDialogCancel,
//     AlertDialogContent,
//     AlertDialogDescription,
//     AlertDialogTitle,
//     AlertDialogTrigger,
// } from "../ui/AlertDialog";
// import { TooltipContents } from "../ui/Tooltip";
// import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";

// export default function MeasureEditor() {
//     const [selectedMeasure, setSelectedMeasure] = useState<Measure>();
//     const { measures } = useTimingObjectsStore()!;
//     const formRef = useRef<HTMLFormElement>(null);
//     const [timeSignatureNumerator, setTimeSignatureNumerator] =
//         useState<number>(4);
//     const [timeSignatureDenominator, setTimeSignatureDenominator] =
//         useState<(typeof TimeSignature.validDenominators)[number]>(4);
//     const [beatUnit, setBeatUnit] = useState<BeatUnit>(BeatUnit.QUARTER);
//     const [tempoBpm, setTempoBpm] = useState(120);
//     const [hasChanged, setHasChanged] = useState(false);

//     const handleSubmit = useCallback(() => {
//         if (selectedMeasure) {
//             const newMeasure: Measure = new Measure({
//                 ...selectedMeasure,
//                 timeSignature: new TimeSignature({
//                     numerator: timeSignatureNumerator,
//                     denominator: timeSignatureDenominator,
//                 }),
//                 beatUnit: beatUnit,
//                 tempo: tempoBpm,
//             });
//             Measure.updateMeasure({
//                 modifiedMeasure: newMeasure,
//                 existingMeasures: measures,
//             });
//         }
//     }, [
//         beatUnit,
//         measures,
//         selectedMeasure,
//         tempoBpm,
//         timeSignatureDenominator,
//         timeSignatureNumerator,
//     ]);

//     const resetForm = useCallback(() => {
//         if (selectedMeasure) {
//             setTimeSignatureNumerator(selectedMeasure.timeSignature.numerator);
//             setTimeSignatureDenominator(
//                 selectedMeasure.timeSignature.denominator,
//             );
//             setBeatUnit(selectedMeasure.beatUnit);
//             setTempoBpm(selectedMeasure.tempo);
//         }
//     }, [selectedMeasure]);

//     const deleteMeasure = useCallback(() => {
//         if (selectedMeasure) {
//             Measure.deleteMeasure({
//                 measureNumber: selectedMeasure.number,
//                 existingMeasures: measures,
//             });
//         }
//     }, [selectedMeasure, measures]);

//     // Check if any of the form values are different than the initial value
//     useEffect(() => {
//         if (
//             selectedMeasure &&
//             selectedMeasure.timeSignature.numerator ===
//                 timeSignatureNumerator &&
//             selectedMeasure.timeSignature.denominator ===
//                 timeSignatureDenominator &&
//             selectedMeasure.tempo === tempoBpm &&
//             selectedMeasure.beatUnit === beatUnit
//         )
//             setHasChanged(false);
//         else setHasChanged(true);
//     }, [
//         timeSignatureNumerator,
//         timeSignatureDenominator,
//         beatUnit,
//         tempoBpm,
//         selectedMeasure,
//     ]);

//     // Set initial selected measure to measure 1
//     useEffect(() => {
//         if (measures.length > 0) {
//             setSelectedMeasure(measures[0]);
//         }
//     }, [measures, setSelectedMeasure]);

//     useEffect(() => {
//         resetForm();
//     }, [resetForm, selectedMeasure]);

//     return (
//         <div className="flex w-[30rem] flex-col gap-24">
//             <div
//                 id="measures-container"
//                 className="flex w-full min-w-0 flex-col gap-12"
//             >
//                 <div className="flex items-center justify-between">
//                     <h5 className="text-h5 leading-none">Measures</h5>
//                     <div className="flex gap-8">
//                         <Tooltip.Root>
//                             <Tooltip.Trigger asChild>
//                                 <Info size={18} className="text-text/60" />
//                             </Tooltip.Trigger>
//                             <TooltipContents className="p-16">
//                                 <div className="flex gap-8">
//                                     If you&apos;re having trouble getting the
//                                     tempo to line up, try importing a musicXML
//                                     with just one part and no notes. Avoid
//                                     accelerandos and ritardandos
//                                 </div>
//                             </TooltipContents>
//                         </Tooltip.Root>
//                         <Button size="compact" variant="secondary">
//                             <RegisteredActionButton
//                                 registeredAction={
//                                     RegisteredActionsObjects.launchImportMusicXmlFileDialogue
//                                 }
//                                 showTooltip={false}
//                                 className="hover:text-text focus-visible:outline-none"
//                             >
//                                 Import MusicXML
//                             </RegisteredActionButton>
//                         </Button>
//                         {/*
//                             <Button size="compact" variant="primary">
//                                 Add
//                             </Button>
//                         */}
//                     </div>
//                 </div>
//                 <div className="flex w-full flex-nowrap gap-8 overflow-x-scroll px-12 pb-8">
//                     {measures.map((measure) => (
//                         <button
//                             className={`rounded-6 border bg-fg-2 px-12 py-6 hover:cursor-pointer ${
//                                 measure.number === selectedMeasure?.number
//                                     ? "border-accent"
//                                     : "border-stroke"
//                             }`}
//                             key={measure.number}
//                             onClick={() => setSelectedMeasure(measure)}
//                         >
//                             {measure.number}
//                         </button>
//                     ))}
//                 </div>
//             </div>
//             {selectedMeasure && (
//                 <Form.Root
//                     ref={formRef}
//                     id="Edit measure form"
//                     onSubmit={(event) => {
//                         event.preventDefault();
//                         handleSubmit();
//                     }}
//                     className="flex flex-col gap-12"
//                 >
//                     {selectedMeasure && (
//                         <>
//                             <h5 className="text-h5">
//                                 Measure {selectedMeasure.number}
//                             </h5>
//                             {/* -------- Time Signature -------- */}
//                             <Form.Field
//                                 name="timeSignature"
//                                 id="time signature container"
//                                 className="flex items-center justify-between gap-32 px-12"
//                             >
//                                 <Form.Label className="w-full text-body text-text/80">
//                                     Time Signature
//                                 </Form.Label>
//                                 <div className="flex items-center gap-8">
//                                     <Form.Control asChild>
//                                         <Input
//                                             type="number"
//                                             min={1}
//                                             required
//                                             step={1}
//                                             className="w-[6rem] min-w-0"
//                                             value={timeSignatureNumerator}
//                                             onChange={(e) =>
//                                                 setTimeSignatureNumerator(
//                                                     e.currentTarget
//                                                         .valueAsNumber,
//                                                 )
//                                             }
//                                         />
//                                     </Form.Control>
//                                     /
//                                     <Form.Control asChild>
//                                         <Select
//                                             value={timeSignatureDenominator.toString()}
//                                             onValueChange={(value: string) =>
//                                                 setTimeSignatureDenominator(
//                                                     parseInt(
//                                                         value,
//                                                     ) as (typeof TimeSignature.validDenominators)[number],
//                                                 )
//                                             }
//                                         >
//                                             <SelectTriggerButton
//                                                 label={timeSignatureDenominator.toString()}
//                                             />
//                                             <SelectContent>
//                                                 {TimeSignature.validDenominators.map(
//                                                     (denominator) => (
//                                                         <SelectItem
//                                                             key={denominator}
//                                                             value={`${denominator}`}
//                                                         >
//                                                             {denominator}
//                                                         </SelectItem>
//                                                     ),
//                                                 )}
//                                             </SelectContent>
//                                         </Select>
//                                     </Form.Control>
//                                 </div>
//                             </Form.Field>
//                             {/* -------- Beat Unit -------- */}
//                             <Form.Field
//                                 name="beatUnit"
//                                 id="beat unit container"
//                                 className="flex items-center justify-between gap-32 px-12"
//                             >
//                                 <Form.Label
//                                     htmlFor="measure-tempo-beat-unit"
//                                     className="w-full text-body text-text/80"
//                                 >
//                                     Beat Unit
//                                 </Form.Label>
//                                 <Form.Control asChild>
//                                     <Select
//                                         value={beatUnit.toString()}
//                                         onValueChange={(value: string) =>
//                                             setBeatUnit(
//                                                 BeatUnit.fromName(value),
//                                             )
//                                         }
//                                     >
//                                         <SelectTriggerButton
//                                             label={beatUnit.toString()}
//                                             className="w-[384px]"
//                                         />
//                                         <SelectContent>
//                                             {BeatUnit.ALL.map((beatUnit) => (
//                                                 <SelectItem
//                                                     key={beatUnit.name}
//                                                     value={beatUnit.name}
//                                                 >
//                                                     {beatUnit.name}
//                                                 </SelectItem>
//                                             ))}
//                                         </SelectContent>
//                                     </Select>
//                                 </Form.Control>
//                             </Form.Field>
//                             {/* -------- BPM -------- */}
//                             <Form.Field
//                                 name="bpm"
//                                 id="bpm container"
//                                 className="flex items-center justify-between gap-32 px-12"
//                             >
//                                 <Form.Label
//                                     htmlFor="measure-tempo-bpm"
//                                     className="w-full text-body text-text/80"
//                                 >
//                                     BPM
//                                 </Form.Label>
//                                 <Form.Control asChild>
//                                     <Input
//                                         required
//                                         type="number"
//                                         id="measure-tempo-bpm"
//                                         className="flex-grow"
//                                         value={tempoBpm}
//                                         onChange={(e) => {
//                                             setTempoBpm(
//                                                 e.currentTarget.valueAsNumber,
//                                             );
//                                         }}
//                                     />
//                                 </Form.Control>
//                             </Form.Field>
//                         </>
//                     )}
//                     <div className="flex justify-between">
//                         <div className="flex gap-8">
//                             <Button
//                                 disabled={!hasChanged}
//                                 variant="secondary"
//                                 size="compact"
//                                 onClick={resetForm}
//                             >
//                                 Cancel
//                             </Button>
//                             <Button
//                                 disabled={!hasChanged}
//                                 type="submit"
//                                 variant="primary"
//                                 size="compact"
//                             >
//                                 Save
//                             </Button>
//                         </div>
//                         <AlertDialog>
//                             <AlertDialogTrigger asChild>
//                                 <Button
//                                     disabled={!selectedMeasure}
//                                     variant="red"
//                                     size="compact"
//                                 >
//                                     Delete
//                                 </Button>
//                             </AlertDialogTrigger>
//                             <AlertDialogContent>
//                                 <AlertDialogTitle>Warning</AlertDialogTitle>
//                                 <AlertDialogDescription>
//                                     Are you sure you want to delete measure{" "}
//                                     {selectedMeasure.number}? You cannot undo
//                                     this! (yet)
//                                 </AlertDialogDescription>
//                                 <div className="flex w-full justify-end gap-8">
//                                     <AlertDialogTrigger>
//                                         <Button
//                                             variant="red"
//                                             size="compact"
//                                             onClick={deleteMeasure}
//                                         >
//                                             Delete
//                                         </Button>
//                                     </AlertDialogTrigger>
//                                     <AlertDialogCancel>
//                                         <Button
//                                             variant="secondary"
//                                             size="compact"
//                                         >
//                                             Cancel
//                                         </Button>
//                                     </AlertDialogCancel>
//                                 </div>
//                             </AlertDialogContent>
//                         </AlertDialog>
//                     </div>
//                 </Form.Root>
//             )}
//         </div>
//     );
// }
