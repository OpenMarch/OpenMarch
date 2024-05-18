import Measure from "@/global/classes/Measure";
import abcToMeasures from "../abcToMeasures";
import BeatUnit from "@/global/classes/BeatUnit";
import TimeSignature from "@/global/classes/TimeSignature";

describe("abcToMeasures", () => {
  it("Returns empty when no measure", () => {
    const abcString = `
X:1
T:Untitled score
C:Composer   / arranger
%%measurenb 1
L:1/4
Q:1/4=100
M:4/4
`;

    expect(abcToMeasures(abcString, true)).toEqual([]);
  });

  it("parses multiple measures with same time signature and tempo", () => {
    const abcString = `
X:1
T:Untitled score
C:Composer   / arranger
%%measurenb 2
L:1/4
Q:1/4=100
M:4/4
I:linebreak  $
K:C
V:1 treble nm="Oboe" snm="Ob."
V:1 G z z2   | z4
|  %6
`;

    const expectedMeasures = [
      new Measure({
        number: 1,
        timeSignature: TimeSignature.fromString("4/4"),
        tempo: 100,
        beatUnit: BeatUnit.QUARTER,
      }), new Measure({
        number: 2,
        timeSignature: TimeSignature.fromString("4/4"),
        tempo: 100,
        beatUnit: BeatUnit.QUARTER,
      })
    ];
    expect(abcToMeasures(abcString)).toEqual(expectedMeasures);
  });

  it("parses multiple measures with different time signatures and tempos", () => {
    const abcString = `
X:1
T:Untitled score
C:Composer   / arranger
%%measurenb 3
L:1/4
Q:1/4=100
M:4/4
I:linebreak  $
K:C
V:1 treble nm="Oboe" snm="Ob."
V:1
G z z2   | z4   |[M:3/4][Q:1/4=120]"^A" z3 | %3
| z3  |[M:2/2][Q:1/2=144]"^12" z4   | z4  |[M:6/8][Q:3/8=80]"^12" z3  | z3 |  %6
`;
    const expectedMeasures = [
      new Measure({
        number: 1,
        timeSignature: TimeSignature.fromString("4/4"),
        tempo: 100,
        beatUnit: BeatUnit.QUARTER,
      }), new Measure({
        number: 2,
        timeSignature: TimeSignature.fromString("4/4"),
        tempo: 100,
        beatUnit: BeatUnit.QUARTER,
      }), new Measure({
        number: 3,
        timeSignature: TimeSignature.fromString("3/4"),
        tempo: 120,
        beatUnit: BeatUnit.QUARTER,
      }), new Measure({
        number: 4,
        timeSignature: TimeSignature.fromString("3/4"),
        tempo: 120,
        beatUnit: BeatUnit.QUARTER,
      }), new Measure({
        number: 5,
        timeSignature: TimeSignature.fromString("2/2"),
        tempo: 144,
        beatUnit: BeatUnit.HALF,
      }), new Measure({
        number: 6,
        timeSignature: TimeSignature.fromString("2/2"),
        tempo: 144,
        beatUnit: BeatUnit.HALF,
      }), new Measure({
        number: 7,
        timeSignature: TimeSignature.fromString("6/8"),
        tempo: 80,
        beatUnit: BeatUnit.DOTTED_QUARTER,
      }), new Measure({
        number: 8,
        timeSignature: TimeSignature.fromString("6/8"),
        tempo: 80,
        beatUnit: BeatUnit.DOTTED_QUARTER,
      })
    ];
    expect(abcToMeasures(abcString)).toEqual(expectedMeasures);
  });

  it("Handles multiple voices", () => {
    const abcString = `
X:1
T:Untitled score
C:Composer   / arranger
%%measurenb 2
L:1/4
Q:1/4=100
M:4/4
I:linebreak  $
K:C
V:1 treble nm="Oboe" snm="Ob."
V:2 treble nm="Clarinet" snm="Cl."
V:1 G z z2   | z4 |  %6
V:2
G z z2  | z4 |  %2
`;

    const expectedMeasures = [
      new Measure({
        number: 1,
        timeSignature: TimeSignature.fromString("4/4"),
        tempo: 100,
        beatUnit: BeatUnit.QUARTER,
      }), new Measure({
        number: 2,
        timeSignature: TimeSignature.fromString("4/4"),
        tempo: 100,
        beatUnit: BeatUnit.QUARTER,
      })
    ];
    expect(abcToMeasures(abcString)).toEqual(expectedMeasures);
  });
});
