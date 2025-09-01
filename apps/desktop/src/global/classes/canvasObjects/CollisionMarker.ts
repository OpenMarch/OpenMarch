import { fabric } from "fabric";
import OpenMarchCanvas from "./OpenMarchCanvas";

class CollisionMarker extends fabric.Circle {
    private textObject?: fabric.Text;
    private _radius: number;
    private _y: number;
    public readonly isCollisionMarker = true; // Add identifier for cleanup

    /**
     * @param x x coordinate of collision indicator
     * @param y y coordinate of collision indicator
     * @param radius size of the indicator
     * @param canvas canvas reference
     * @param color rgba color value
     */
    constructor(
        x: number,
        y: number,
        radius: number,
        public readonly canvas: OpenMarchCanvas,
        color: string = "rgba(255,0,0,0.5)",
    ) {
        super({
            left: x,
            top: y,
            originX: "center",
            originY: "center",
            radius,
            fill: color,
            stroke: "red",
            strokeWidth: 2,
            selectable: false,
            evented: false,
        });

        this._radius = radius;
        this._y = y;
    }

    public addText(text: string, color: string = "red", font: number = 12) {
        // Remove existing text if any
        if (this.textObject) {
            this.canvas.remove(this.textObject);
        }

        // Create new text object positioned at the center of the collision marker
        this.textObject = new fabric.Text(text, {
            left: this.left,
            top: this._y - font - this._radius / 2,
            originX: "center",
            originY: "center",
            fontSize: font,
            fill: color,
            fontFamily: "Arial",
            selectable: false,
            evented: false,
        });

        // Add identifier to text object for cleanup
        (this.textObject as any).isCollisionMarker = true;
    }

    public draw() {
        // Add the collision circle to canvas
        this.canvas.add(this as unknown as fabric.Object);

        // Add the text object if it exists
        if (this.textObject) {
            this.canvas.add(this.textObject);
        }
    }

    public remove() {
        // Remove both the circle and text from canvas
        this.canvas.remove(this as unknown as fabric.Object);
        if (this.textObject) {
            this.canvas.remove(this.textObject);
        }
    }
}

export default CollisionMarker;
