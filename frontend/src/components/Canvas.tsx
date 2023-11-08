import React, { useRef, useEffect } from "react";
import { fabric } from "fabric";
import { FaSmile } from "react-icons/fa";
import { Button } from "react-bootstrap";
import { linearEasing } from "../utils";
import { useMarcherStore, usePageStore, useMarcherPageStore } from "../stores/Store";
import { useSelectedPage } from "../context/SelectedPageContext";
import { useSelectedMarcher } from "../context/SelectedMarcherContext";
import { IGroupOptions } from "fabric/fabric-impl";
import { idForHtmlToId } from "../Constants";
import { updateMarcherPage } from "../api/api";

interface Dimension {
    width: number;
    height: number;
    name: string;
    actualHeight: number;
}

interface CanvasMarcher {
    fabricObject: fabric.Object | null;
    x: number;
    y: number;
    drill_number: string;
    id_for_html: string;
    marcher_id: number;
}

interface IGroupOptionsWithId extends IGroupOptions {
    id_for_html: string | number;
}

// All dimensions are in tenth steps (2.25 inches)
const canvasDimensions = {
    footballField: { width: 1600, height: 854, name: "Football Field", actualHeight: 840 },
};

function Canvas() {
    const { marchers, marchersAreLoading } = useMarcherStore()!;
    const { pages, pagesAreLoading } = usePageStore()!;
    const { marcherPages, marcherPagesAreLoading, fetchMarcherPages } = useMarcherPageStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarcher, setSelectedMarcher } = useSelectedMarcher()!;
    const [canvas, setCanvas] = React.useState<fabric.Canvas>();
    const [isLoading, setIsLoading] = React.useState<boolean>(true);
    const [canvasMarchers, setCanvasMarchers] = React.useState<CanvasMarcher[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    //   const rootStore = useStore();
    //   const { UIStore } = rootStore;

    // -------------------------- useEffects --------------------------
    // Set Loading
    useEffect(() => {
        setIsLoading(marchersAreLoading || pagesAreLoading || marcherPagesAreLoading);
    }, [pagesAreLoading, marcherPagesAreLoading, marchersAreLoading]);

    // Initialize the canvas.
    // Update the objectModified listener when the selected page changes
    useEffect(() => {
        if (!canvas && selectedPage && canvasRef.current) {
            console.log("Canvas.tsx: useEffect: create canvas");
            setCanvas(new fabric.Canvas(canvasRef.current, {}));

            // Handle window resize event
            // window.addEventListener("resize", buildField);

            // Clean up event listener on component unmount
            // return () => {
            //     window.removeEventListener("resize", buildField);
            // };‰
        }
        if (canvas) {
            refreshListeners();
        }
    }, [selectedPage]);

    // Create the canvas and field
    useEffect(() => {
        if (canvas) {
            // Set canvas size
            canvas.setDimensions(canvasDimensions.footballField);

            // Set canvas configuration options
            canvas.backgroundColor = "white";
            canvas.selectionColor = "white";
            canvas.selectionLineWidth = 8;

            // set initial canvas size
            const staticGrid = buildField(canvasDimensions.footballField);
            canvas.add(staticGrid);

            intitiateListeners();

            // Cleanup
            return () => { cleanupListeners(); }
        }
    }, [canvas]);

    // TODO These are only separated for debugging purposes. They should be combined
    // Render the marchers when the canvas and marchers are loaded
    useEffect(() => {
        // console.log("UseEffect: renderMarchers - marchers", selectedPage);
        if (canvas && !isLoading) {
            if (canvasMarchers.length == marchers.length)
                updateMarcherLabels();
            else
                renderMarchers();
        }
    }, [marchers]);
    useEffect(() => {
        // console.log("UseEffect: renderMarchers - pages", selectedPage);
        if (canvas && !isLoading) {
            // console.log("Rendering canvas - pages");
            renderMarchers();
        }
    }, [pages]);
    useEffect(() => {
        // console.log("UseEffect: renderMarchers - marcherPages", selectedPage);
        if (canvas && !isLoading) {
            // console.log("Rendering canvas - marcherPages");
            renderMarchers();
        }
    }, [marcherPages]);
    useEffect(() => {
        // console.log("UseEffect: renderMarchers - selected page", selectedPage);
        if (canvas && !isLoading) {
            // console.log("Rendering canvas - selectedPage");
            renderMarchers();
        }
    }, [selectedPage]);
    useEffect(() => {
        // console.log("UseEffect: renderMarchers - isLoading", selectedPage);
        // console.log("loading:", isLoading, "marchersHaveBeenModified:", marchersHaveBeenModified, "canvas", canvas !== null);
        if (canvas && !isLoading) {
            renderMarchers();
        }
    }, [isLoading]);

    // Change the active object when the selected marcher changes
    useEffect(() => {
        if (canvas && !isLoading && canvasMarchers.length > 0 && selectedMarcher) {
            const curMarcher = canvasMarchers.find((canvasMarcher) => canvasMarcher.marcher_id === selectedMarcher.id);
            if (curMarcher && curMarcher.fabricObject) {
                canvas.setActiveObject(curMarcher.fabricObject);
            }
            else
                throw new Error("Marcher or fabric object not found - renderMarchers: Canvas.tsx");
        }
    }, [selectedMarcher]);

    // -------------------------- Listener Functions --------------------------

    const intitiateListeners = () => {
        if (canvas) {
            canvas.on('object:modified', handleObjectModified);

            canvas.on('selection:updated', handleSelect);
            canvas.on('selection:created', handleSelect);
            canvas.on('selection:cleared', handleDeselect);
        }
    };

    const refreshListeners = () => {
        if (canvas) {
            // Updates the objectModified listener so it is on the correct page
            // TODO is there a better way to do this?
            canvas.off('object:modified');
            canvas.on('object:modified', handleObjectModified);
        }
    };

    const cleanupListeners = () => {
        if (canvas) {
            canvas.off('object:modified');

            canvas.off('selection:updated');
            canvas.off('selection:created');
            canvas.off('selection:cleared');
        }
    };

    const handleObjectModified = (e: any) => {
        // console.log("handleObjectModified:", e.target);
        // console.log('selectedPage:', selectedPage);
        const target = e.target;
        if (e.target?.id_for_html && e.target?.left && e.target?.top) {
            const id = idForHtmlToId(e.target.id_for_html);
            // const marcherPage = marcherPages.find((marcherPage) => marcherPage.marcher_id === id);
            updateMarcherPage(id, selectedPage!.id, target.left, target.top).then(() => { fetchMarcherPages() });
        }
    };

    // Set the selected marcher when selected element changes
    const handleSelect = (e: any) => {
        // console.log("handleSelect:", e.selected);

        // Check if it is a single selected element rather than a group
        if (e.selected?.length === 1 && e.selected[0].id_for_html) {
            const id_for_html = e.selected[0].id_for_html;
            setSelectedMarcher(marchers.find((marcher) => marcher.id_for_html === id_for_html) || null);
        }
    };

    // Deselect the marcher when the selection is cleared
    const handleDeselect = (e: any) => {
        // console.log("handleDeselect:", e.deselected);

        if (e.deselected) { setSelectedMarcher(null); }
    };

    const getSelectedPage = () => {
        return selectedPage;
    };

    // -------------------------- Field Functions --------------------------
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

            // --- Numbers ---
            // Bottom numbers
            for (let i = 1; i <= 19; i += 1) {
                const num = (i * 5 > 50) ? (100 - i * 5) : (i * 5);
                fieldArray.push(new fabric.Text(num.toString(), {
                    left: 0 + (i * 80 - (num > 5 ? 20 : 10)),
                    top: height - 142,
                    ...numberProps
                }));
            }
            // Top numbers
            for (let i = 1; i <= 19; i += 1) {
                const num = (i * 5 > 50) ? (100 - i * 5) : (i * 5);
                fieldArray.push(new fabric.Text(num.toString(), {
                    left: 0 + (i * 80 - (num > 5 ? 20 : 10)),
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
            for (let i = 0; i < width; i += 80)
                fieldArray.push(new fabric.Line([i, top, i, height], yardLineProps));

            // Hashes (college)
            for (let i = 0; i < width + 1; i += 80)
                fieldArray.push(new fabric.Line([i - 10, height - 320, i + 10, height - 320], hashProps));
            for (let i = 0; i < width + 1; i += 80)
                fieldArray.push(new fabric.Line([i - 10, height - 520, i + 10, height - 520], hashProps));

            // Border
            fieldArray.push(new fabric.Line([0, 0, 0, height], borderProps));
            fieldArray.push(new fabric.Line([0, height - 840, width, height - 840], borderProps));
            fieldArray.push(new fabric.Line([0, height - 1, width, height - 1], borderProps));
            fieldArray.push(new fabric.Line([width - 1, 0, width - 1, height], borderProps));
        }
        const field = new fabric.Group(fieldArray, {
            selectable: false,
            hoverCursor: "default",
        });
        return field;
    };

    // -------------------------- Animation Functions --------------------------
    const startAnimation = () => {
        if (canvas) {
            // canvasMarchers[0]?.animate("down", "+=100", { onChange: canvas.renderAll.bind(canvas) });
            canvasMarchers.forEach((CanvasMarcher) => {
                const matrix = CanvasMarcher?.fabricObject?.calcTransformMatrix();
                CanvasMarcher?.fabricObject?.animate({
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

    // ------------------------ Marcher Functions ------------------------
    const createMarcher = (x: number, y: number, id_for_html: string, marcher_id: number, label?: string): CanvasMarcher => {
        let radius = 8;

        const newMarcherCircle = new fabric.Circle({
            left: x - radius,
            top: y - radius,
            fill: "red",
            radius: radius,
        });

        const marcherLabel = new fabric.Text(label || "nil", {
            top: y - 30,
            fontFamily: "courier",
            fontSize: 20,
        });
        marcherLabel.left = x - marcherLabel!.width! / 2;

        const marcherGroup = new fabric.Group([newMarcherCircle, marcherLabel], {
            id_for_html: id_for_html,
            hasControls: false,
            hasBorders: true,
            lockRotation: true,
            hoverCursor: "pointer",
        } as IGroupOptionsWithId);

        const newMarcher = {
            fabricObject: marcherGroup,
            x: x,
            y: y,
            id_for_html: id_for_html,
            drill_number: label || "nil",
            marcher_id: marcher_id
        }
        canvasMarchers.push(newMarcher);
        canvas!.add(marcherGroup);
        return newMarcher;
    };

    // Create new marchers based on the selected page if they haven't been created yet
    // Moves the current marchers to the new page
    const renderMarchers = () => {
        // console.log("renderMarchers:", selectedPage);
        const curMarcherPages = marcherPages.filter((marcherPage) => marcherPage.page_id === selectedPage?.id);
        curMarcherPages.forEach((marcherPage) => {
            // Marcher does not exist on the Canvas, create a new one
            if (!canvasMarchers.find((canvasMarcher) => canvasMarcher.marcher_id === marcherPage.marcher_id)) {
                const curMarcher = marchers.find((marcher) => marcher.id === marcherPage.marcher_id);
                if (curMarcher)
                    createMarcher(
                        marcherPage.x, marcherPage.y, curMarcher.id_for_html, curMarcher.id, curMarcher.drill_number);
                else
                    throw new Error("Marcher not found - renderMarchers: Canvas.tsx");
            }
            // Marcher does exist on the Canvas, move it to the new location if it has changed
            else {
                const canvasMarcher = canvasMarchers.find(
                    (canvasMarcher) => canvasMarcher.marcher_id === marcherPage.marcher_id);

                if (canvasMarcher && canvasMarcher.fabricObject) {
                    canvasMarcher.fabricObject!.left = marcherPage.x;
                    canvasMarcher.fabricObject!.top = marcherPage.y;
                    canvasMarcher.fabricObject!.setCoords();
                } else
                    throw new Error("Marcher or fabric object not found - renderMarchers: Canvas.tsx");
            }
        });
        canvas!.renderAll();
    };

    const updateMarcherLabels = () => {
        canvasMarchers.forEach((canvasMarcher) => {
            if (canvasMarcher.fabricObject instanceof fabric.Group) {
                canvasMarcher.drill_number =
                    marchers.find((marcher) => marcher.id === canvasMarcher.marcher_id)?.drill_number || "nil";
                const textObject = canvasMarcher.fabricObject._objects[1] as fabric.Text;
                if (textObject.text !== canvasMarcher.drill_number)
                    textObject.set({ text: canvasMarcher.drill_number });
            }
        });
        canvas?.renderAll();
    };

    const createDefaultMarchers = () => {
        for (let i = 0; i < 10; i++) {
            createMarcher((i + 4) * 50, 50, "defaultMarcher_" + i.toString(), i);
        }
    };

    return (
        <div className="canvas-container">
            <canvas ref={canvasRef} id="fieldCanvas" className="field-canvas" />
            <Button
                variant="secondary" onClick={createDefaultMarchers}>
                <FaSmile />
            </ Button>
        </div>
    );
};

export default Canvas;
