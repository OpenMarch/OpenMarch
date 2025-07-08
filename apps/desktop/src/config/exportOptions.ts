export interface CoordinateRoundingOption {
    label: string;
    value: number;
}

export const coordinateRoundingOptions: CoordinateRoundingOption[] = [
    { label: "1/1 (Whole Step)", value: 1 },
    { label: "1/2 (Half Step)", value: 2 },
    { label: "1/4 (Quarter Step)", value: 4 },
    { label: "1/8 (Eighth Step)", value: 8 },
    { label: "1/10 (Tenth Step)", value: 10 },
];
