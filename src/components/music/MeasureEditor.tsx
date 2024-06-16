import { useMeasureStore } from "@/stores/measure/useMeasureStore";
import { useState, useRef, useEffect } from "react";

export default function MeasureEditor() {

    // const { measures } = useMeasureStore()!;
    // const [dataReady, setDataReady] = useState(false);
    // const divRef = useRef<HTMLDivElement | null>(null);
    // let osmd = useRef<OSMD | null>(null);
    // const { Renderer, Stave } = Vex.Flow;

    // useEffect(() => {
    //     if (!divRef.current) return;
    //     const options = { autoResize: true, drawTitle: true };
    //     osmd.current = new OSMD(divRef.current, options);
    //     osmd.current.load('score.xml"').then(() => osmd.current!.render());
    // }, [dataReady]);


    // useEffect(() => {
    //     if (!divRef.current) return;
    //     // Create an SVG renderer and attach it to the DIV element named "boo".
    //     const renderer = new Renderer(divRef.current, Renderer.Backends.SVG);
    //     // Configure the rendering context.
    //     renderer.resize(500, 500);
    //     const context = renderer.getContext();

    //     // Create a stave of width 400 at position 10, 40 on the canvas.
    //     const stave = new Stave(10, 40, 400);

    //     // Add a clef and time signature.
    //     stave.addClef("treble").addTimeSignature("4/4");

    //     // Connect it to the rendering context and draw!
    //     stave.setContext(context).draw();
    // }, [Renderer, Stave]);
    return (
        <div>
            Measure Editor
        </div>
    );
}
