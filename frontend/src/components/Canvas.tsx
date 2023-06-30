import { useObserver } from "mobx-react-lite";
import React, { useRef, useEffect } from "react";
import { fabric } from "fabric";
import { FaSmile } from "react-icons/fa";
import { Button } from "react-bootstrap";
import { linearEasing } from "../utils";
// import useStore from "../hooks/useStore";

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

            const rect = new fabric.Rect({
                left: 100,
                top: 100,
                fill: "red",
                width: 20,
                height: 20,
            });

            // Set canvas configuration options
            canvas.backgroundColor = "rgb(0,100,0)";
            canvas.selectionColor = "white";
            canvas.selectionLineWidth = 8;

            canvas.add(rect);

            // set initial canvas size
            updateCanvasSize();

            // Handle window resize event
            window.addEventListener("resize", updateCanvasSize);

            createDefaultMarchers();

            // Clean up event listener on component unmount
            return () => {
                window.removeEventListener("resize", updateCanvasSize);
            };
        }
    }, []);

    const updateCanvasSize = () => {
        if (canvas) {
            // console.log("Window size", window.innerWidth, window.innerHeight);

            // Set canvas size
            canvas.setDimensions({ width: window.innerWidth, height: window.innerHeight * .8 });
        }
    };

    // MOTION FUNCTIONS
    const createMarcher = (x: number, y: number):marcher => {
        let radius = 10;
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
            createMarcher((i +4) * 50, 50);
        }
    };

    const startAnimation = () => {
        if (canvas) {
            console.log("start animation");
            // marchers[0]?.animate("down", "+=100", { onChange: canvas.renderAll.bind(canvas) });
            marchers.forEach((marcher) => {
                marcher?.animate({
                    left: "+=0",
                    top: "+=100",
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
