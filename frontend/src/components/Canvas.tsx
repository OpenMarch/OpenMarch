import React, { useRef, useEffect } from "react";
import { fabric } from "fabric";
import { FaSmile } from "react-icons/fa";
import { Button } from "react-bootstrap";
import { linearEasing } from "../utils";
// import useStore from "../hooks/useStore";

interface Dimension {
    width: number;
    height: number;
    name: string;
    actualHeight: number;
}

// All dimensions are in tenth steps (2.25 inches)
const canvasDimensions = {
    footballField: { width: 1920, height: 854, name: "Football Field", actualHeight: 840 },
};

const Canvas: React.FC = () => {
    type marcher = fabric.Circle | fabric.Rect | null;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const canvasEl = canvasRef.current;
    let canvas: fabric.Canvas | null = null;
    let marchers: marcher[] = [];
    //   const rootStore = useStore();
    //   const { UIStore } = rootStore;

    useEffect(() => {
        if (canvasRef.current) {
            canvas = new fabric.Canvas(canvasRef.current!);

            // Set canvas size
            canvas.setDimensions(canvasDimensions.footballField);

            // Set canvas configuration options
            canvas.backgroundColor = "white";
            canvas.selectionColor = "white";
            canvas.selectionLineWidth = 8;

            // set initial canvas size
            const staticGrid = buildField(canvasDimensions.footballField);
            canvas.add(staticGrid);

            // const rect = new fabric.Rect({
            //     left: 100,
            //     top: 100,
            //     fill: "red",
            //     width: 20,
            //     height: 20,
            // });


            // canvas.add(rect);

            // Handle window resize event
            // window.addEventListener("resize", buildField);

            createDefaultMarchers();

            // Clean up event listener on component unmount
            // return () => {
            //     window.removeEventListener("resize", buildField);
            // };‰
        }
    }, []);

    const buildField = (dimensions: Dimension) => {
        const fieldArray: fabric.Object[] = [];
        if (canvas) {
            const width = dimensions.width;
            const height = dimensions.height;
            const actualHeight = dimensions.actualHeight;
            const top = height - actualHeight;

            // Build the grid lines. This is only for a football field right now.
            const borderProps = { stroke: "black", strokeWidth: 3, selectable: false };
            const yardLineProps = { stroke: "black", strokeWidth: 1.2, selectable: false };
            const halfLineProps = { stroke: "#AAAAAA", selectable: false };
            const gridProps = { stroke: "#DDDDDD", selectable: false };
            const hashProps = { stroke: "black", strokeWidth: 3, selectable: false };
            const numberProps = { fontSize: 40, fill: "#888888", selectable: false };

            // Grid lines
            for (let i = 10; i < width; i += 10)
                fieldArray.push(new fabric.Line([i, top, i, height], gridProps));
            for (let i = height - 10; i > top; i -= 10)
                fieldArray.push(new fabric.Line([0, i, width, i], gridProps));

            // Numbers
            for (let i = 0; i <= 20; i += 1) {
                const num = (i * 5 > 50) ? (100 - i * 5) : (i * 5);
                fieldArray.push(new fabric.Text(num.toString(), {
                    left: 160 + (i * 80 - (num > 5 ? 20 : 10)),
                    top: height - 142,
                    ...numberProps
                }));
            }
            for (let i = 0; i <= 20; i += 1) {
                const num = (i * 5 > 50) ? (100 - i * 5) : (i * 5);
                fieldArray.push(new fabric.Text(num.toString(), {
                    left: 160 + (i * 80 - (num > 5 ? 20 : 10)),
                    top: height - (80 * 9) - 15,
                    flipY: true,
                    flipX: true,
                    ...numberProps
                }));
            }

            // Half lines and endzones
            for (let i = 40; i < width; i += 80)
                fieldArray.push(new fabric.Line([i, top, i, height], halfLineProps));
            fieldArray.push(new fabric.Line([80, top, 80, height], halfLineProps));
            fieldArray.push(new fabric.Line([width - 80, top, width - 80, height],
                halfLineProps));

            // Verical lines
            for (let i = height - 40; i > 0; i -= 40)
                fieldArray.push(new fabric.Line([0, i, width, i], halfLineProps));

            // Yard lines
            for (let i = 160; i < width - 159; i += 80)
                fieldArray.push(new fabric.Line([i, top, i, height], yardLineProps));

            // Hashes (college)
            for (let i = 160; i < width - 159; i += 80)
                fieldArray.push(new fabric.Line([i - 10, height - 320, i + 10, height - 320], hashProps));
            for (let i = 160; i < width - 159; i += 80)
                fieldArray.push(new fabric.Line([i - 10, height - 520, i + 10, height - 520], hashProps));

            // Border
            fieldArray.push(new fabric.Line([0, 0, 0, height], borderProps));
            fieldArray.push(new fabric.Line([0, height - 840, width, height - 840], borderProps));
            fieldArray.push(new fabric.Line([0, height - 1, width, height - 1], borderProps));
            fieldArray.push(new fabric.Line([width - 1, 0, width - 1, height], borderProps));
        }
        const field = new fabric.Group(fieldArray, { selectable: false });
        return field;
    };

    // MOTION FUNCTIONS
    const createMarcher = (x: number, y: number): marcher => {
        let radius = 8;
        const newMarcher = new fabric.Circle({
            left: x - radius,
            top: y - radius,
            fill: "red",
            radius: radius,
            hasControls: false,
            // hasBorders: false,
            lockRotation: true
        });
        marchers.push(newMarcher);
        canvas?.add(newMarcher);

        return newMarcher;
    };

    const createDefaultMarchers = () => {
        for (let i = 0; i < 10; i++) {
            createMarcher((i + 4) * 50, 50);
        }
    };

    const startAnimation = () => {
        if (canvas) {
            console.log("Canvas.tsx: start animation");
            // marchers[0]?.animate("down", "+=100", { onChange: canvas.renderAll.bind(canvas) });
            marchers.forEach((marcher) => {
                const matrix = marcher?.calcTransformMatrix();
                console.log(matrix);
                marcher?.animate({
                    left: `${matrix![4]}`,
                    top: `${matrix![5]}+100`,
                }, {
                    duration: 1000,
                    onChange: canvas!.renderAll.bind(canvas),
                    easing: linearEasing,
                });
            });
        }
    };

    return (
        <>
            <canvas ref={canvasRef} id="c" />
            <Button
                variant="secondary" onClick={startAnimation}>
                <FaSmile />
            </ Button>
        </>
    );
};

export default Canvas;
