import {
    Canvas,
    Line,
    vec,
    Rect,
    Group,
    Skia,
} from "@shopify/react-native-skia";
import { mockFieldProperties } from "../data/mockFieldProperties";
import { RgbaColor } from "@openmarch/core";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { useWindowDimensions } from "react-native";

const rgbaToString = (color: RgbaColor) =>
    `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;

export default function FieldGrid() {
    const { width, height } = useWindowDimensions();
    const fieldWidth = mockFieldProperties.width;
    const fieldHeight = mockFieldProperties.height;
    const pixelsPerStep = mockFieldProperties.pixelsPerStep;
    const centerFrontPoint = mockFieldProperties.centerFrontPoint;

    const gridLines = [];
    const halfLines = [];
    const xCheckpoints = [];
    const yCheckpoints = [];

    // Grid lines TODO
    // if (true) {
    const gridLineProps = {
        strokeWidth: 1,
        color: rgbaToString(mockFieldProperties.theme.tertiaryStroke),
    };
    // X
    for (let i = centerFrontPoint.xPixels; i < fieldWidth; i += pixelsPerStep) {
        gridLines.push(
            <Line
                key={`glx1-${i}`}
                p1={vec(i, 0)}
                p2={vec(i, fieldHeight)}
                {...gridLineProps}
            />,
        );
    }
    for (
        let i = centerFrontPoint.xPixels - pixelsPerStep;
        i > 0;
        i -= pixelsPerStep
    ) {
        gridLines.push(
            <Line
                key={`glx2-${i}`}
                p1={vec(i, 0)}
                p2={vec(i, fieldHeight)}
                {...gridLineProps}
            />,
        );
    }

    // Y
    for (let i = centerFrontPoint.yPixels; i > 0; i -= pixelsPerStep) {
        gridLines.push(
            <Line
                key={`gly1-${i}`}
                p1={vec(0, i)}
                p2={vec(fieldWidth, i)}
                {...gridLineProps}
            />,
        );
    }
    // }

    // Half lines ADD CUSTOMIZATION
    // if (true) {
    const darkLineProps = {
        strokeWidth: 1,
        color: rgbaToString(mockFieldProperties.theme.secondaryStroke),
    };
    // X
    if (mockFieldProperties.halfLineXInterval) {
        for (
            let i = centerFrontPoint.xPixels;
            i < fieldWidth;
            i += pixelsPerStep * mockFieldProperties.halfLineXInterval
        ) {
            halfLines.push(
                <Line
                    key={`hlx1-${i}`}
                    p1={vec(i, 0)}
                    p2={vec(i, fieldHeight)}
                    {...darkLineProps}
                />,
            );
        }
        for (
            let i =
                centerFrontPoint.xPixels -
                pixelsPerStep * mockFieldProperties.halfLineXInterval;
            i > 0;
            i -= pixelsPerStep * mockFieldProperties.halfLineXInterval
        ) {
            halfLines.push(
                <Line
                    key={`hlx2-${i}`}
                    p1={vec(i, 0)}
                    p2={vec(i, fieldHeight)}
                    {...darkLineProps}
                />,
            );
        }
    }
    // Y
    if (mockFieldProperties.halfLineYInterval) {
        for (
            let i = centerFrontPoint.yPixels;
            i > 0;
            i -= pixelsPerStep * mockFieldProperties.halfLineYInterval
        ) {
            halfLines.push(
                <Line
                    key={`hly1-${i}`}
                    p1={vec(0, i)}
                    p2={vec(fieldWidth, i)}
                    {...darkLineProps}
                />,
            );
        }
    }
    // }

    // Yard lines and hashes
    const xCheckpointProps = {
        strokeWidth: 1,
        color: rgbaToString(mockFieldProperties.theme.primaryStroke),
    };
    const yCheckpointProps = {
        strokeWidth: 3,
        color: rgbaToString(mockFieldProperties.theme.primaryStroke),
    };

    for (const xCheckpoint of mockFieldProperties.xCheckpoints) {
        if (!xCheckpoint.visible) continue;
        const x =
            centerFrontPoint.xPixels +
            xCheckpoint.stepsFromCenterFront * pixelsPerStep;
        xCheckpoints.push(
            <Line
                key={`x-cp-${xCheckpoint.id}`}
                p1={vec(x, 0)}
                p2={vec(x, fieldHeight)}
                {...xCheckpointProps}
            />,
        );

        if (mockFieldProperties.useHashes) {
            const hashWidth = 20;
            for (const yCheckpoint of mockFieldProperties.yCheckpoints) {
                if (!yCheckpoint.visible) continue;
                const y =
                    centerFrontPoint.yPixels +
                    yCheckpoint.stepsFromCenterFront * pixelsPerStep;
                let x1 = x - hashWidth / 2;
                x1 = x1 < 0 ? 0 : x1;
                let x2 = x + hashWidth / 2;
                x2 = x2 > fieldWidth ? fieldWidth : x2;
                yCheckpoints.push(
                    <Line
                        key={`y-cp-${xCheckpoint.id}-${yCheckpoint.id}`}
                        p1={vec(x1, y)}
                        p2={vec(x2, y)}
                        {...yCheckpointProps}
                    />,
                );
            }
        }
    }

    if (!mockFieldProperties.useHashes) {
        for (const yCheckpoint of mockFieldProperties.yCheckpoints) {
            if (!yCheckpoint.visible) continue;
            const y =
                centerFrontPoint.yPixels +
                yCheckpoint.stepsFromCenterFront * pixelsPerStep;
            yCheckpoints.push(
                <Line
                    key={`y-cp-${yCheckpoint.id}`}
                    p1={vec(0, y)}
                    p2={vec(fieldWidth, y)}
                    {...xCheckpointProps}
                />,
            );
        }
    }

    const initialMatrix = Skia.Matrix();
    const scale = Math.min(width / fieldWidth, height / fieldHeight);
    initialMatrix.scale(scale, scale);
    const matrix = useSharedValue(initialMatrix);
    const startMatrix = useSharedValue(Skia.Matrix());
    const gesture = Gesture.Race(
        Gesture.Pan()
            .onBegin(() => {
                startMatrix.value = matrix.value;
            })
            .onUpdate((e) => {
                const { translationX, translationY } = e;
                const panMatrix = Skia.Matrix();
                panMatrix.translate(translationX, translationY);
                matrix.value = Skia.Matrix();
                matrix.value.concat(startMatrix.value);
                matrix.value.concat(panMatrix);
            }),
        Gesture.Pinch()
            .onBegin(() => {
                startMatrix.value = matrix.value;
            })
            .onUpdate((e) => {
                const { scale, focalX, focalY } = e;
                const pinchMatrix = Skia.Matrix();
                pinchMatrix.translate(focalX, focalY);
                pinchMatrix.scale(scale, scale);
                pinchMatrix.translate(-focalX, -focalY);
                matrix.value = Skia.Matrix();
                matrix.value.concat(startMatrix.value);
                matrix.value.concat(pinchMatrix);
            }),
    );

    return (
        <GestureDetector gesture={gesture}>
            <Canvas style={{ flex: 1 }}>
                <Group matrix={matrix}>
                    <Rect
                        x={0}
                        y={0}
                        width={fieldWidth}
                        height={fieldHeight}
                        color={rgbaToString(
                            mockFieldProperties.theme.background,
                        )}
                    />
                    {gridLines}
                    {halfLines}
                    {xCheckpoints}
                    {yCheckpoints}
                </Group>
            </Canvas>
        </GestureDetector>
    );
}
