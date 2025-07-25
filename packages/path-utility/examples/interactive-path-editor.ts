import { Path, Line, CubicCurve, Spline, ControlPointManager, ControlPoint } from "../src";

/**
 * Example: Interactive Path Editor
 * 
 * This example demonstrates how to use the path utility's control point system
 * to create an interactive path editor that can be integrated into a web UI.
 */
export class InteractivePathEditor {
    private manager: ControlPointManager;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private isDragging = false;
    private draggedControlPoint: string | null = null;
    private hoveredControlPoint: string | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        
        // Create a sample path with different segment types
        const path = new Path([
            new Line({ x: 50, y: 200 }, { x: 150, y: 200 }),
            new CubicCurve(
                { x: 150, y: 200 },
                { x: 200, y: 100 },
                { x: 300, y: 300 },
                { x: 350, y: 200 }
            ),
            Spline.fromPoints([
                { x: 350, y: 200 },
                { x: 400, y: 150 },
                { x: 450, y: 250 },
                { x: 500, y: 200 }
            ])
        ]);

        // Create control point manager with custom styling
        this.manager = new ControlPointManager(path, {
            visible: true,
            handleRadius: 8,
            handleColor: '#4A90E2',
            selectedColor: '#FF6B6B',
            showControlLines: true,
            controlLineColor: '#CCCCCC'
        });

        // Set up event listeners
        this.setupEventListeners();

        // Set up real-time callbacks
        this.manager.addMoveCallback((id, point) => {
            console.log(`Control point ${id} moved to (${point.x}, ${point.y})`);
            this.render();
        });

        // Initial render
        this.render();
    }

    private setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
    }

    private onMouseDown(event: MouseEvent) {
        const point = this.getMousePosition(event);
        const controlPoint = this.manager.getControlPointAt(point, 15);
        
        if (controlPoint) {
            this.isDragging = true;
            this.draggedControlPoint = controlPoint.id;
            this.canvas.style.cursor = 'grabbing';
        }
    }

    private onMouseMove(event: MouseEvent) {
        const point = this.getMousePosition(event);

        if (this.isDragging && this.draggedControlPoint) {
            // Efficiently update only the affected segment
            this.manager.moveControlPoint(this.draggedControlPoint, point);
        } else {
            // Handle hover effects
            const controlPoint = this.manager.getControlPointAt(point, 15);
            const newHovered = controlPoint?.id || null;
            
            if (newHovered !== this.hoveredControlPoint) {
                this.hoveredControlPoint = newHovered;
                this.canvas.style.cursor = controlPoint ? 'grab' : 'default';
                this.render();
            }
        }
    }

    private onMouseUp() {
        this.isDragging = false;
        this.draggedControlPoint = null;
        this.canvas.style.cursor = this.hoveredControlPoint ? 'grab' : 'default';
    }

    private getMousePosition(event: MouseEvent): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    private render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw the path
        this.drawPath();

        // Draw control points and control lines
        this.drawControlPoints();
    }

    private drawPath() {
        const path2D = new Path2D(this.manager.path.toSvgString());
        
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 3;
        this.ctx.stroke(path2D);
    }

    private drawControlPoints() {
        const controlPoints = this.manager.getAllControlPoints();
        const config = this.manager.config;

        // Draw control lines for bezier curves
        if (config.showControlLines) {
            this.drawControlLines(controlPoints);
        }

        // Draw control point handles
        controlPoints.forEach(cp => {
            this.drawControlPointHandle(cp);
        });
    }

    private drawControlLines(controlPoints: ControlPoint[]) {
        this.ctx.strokeStyle = this.manager.config.controlLineColor;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);

        // Group control points by segment
        const segments = new Map<number, ControlPoint[]>();
        controlPoints.forEach(cp => {
            if (!segments.has(cp.segmentIndex)) {
                segments.set(cp.segmentIndex, []);
            }
            segments.get(cp.segmentIndex)!.push(cp);
        });

        // Draw control lines for cubic curves
        segments.forEach((points, segmentIndex) => {
            const segment = this.manager.path.segments[segmentIndex];
            if (segment.type === 'cubic-curve') {
                const startPoint = points.find(p => p.type === 'start');
                const control1 = points.find(p => p.type === 'control1');
                const control2 = points.find(p => p.type === 'control2');
                const endPoint = points.find(p => p.type === 'end');

                if (startPoint && control1) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(startPoint.point.x, startPoint.point.y);
                    this.ctx.lineTo(control1.point.x, control1.point.y);
                    this.ctx.stroke();
                }

                if (endPoint && control2) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(endPoint.point.x, endPoint.point.y);
                    this.ctx.lineTo(control2.point.x, control2.point.y);
                    this.ctx.stroke();
                }
            }
        });

        this.ctx.setLineDash([]);
    }

    private drawControlPointHandle(controlPoint: ControlPoint) {
        const config = this.manager.config;
        const isDragged = controlPoint.id === this.draggedControlPoint;
        const isHovered = controlPoint.id === this.hoveredControlPoint;
        
        this.ctx.beginPath();
        this.ctx.arc(
            controlPoint.point.x,
            controlPoint.point.y,
            config.handleRadius + (isDragged ? 2 : 0),
            0,
            2 * Math.PI
        );

        // Fill color based on state
        if (isDragged) {
            this.ctx.fillStyle = config.selectedColor;
        } else if (isHovered) {
            this.ctx.fillStyle = this.lightenColor(config.handleColor, 20);
        } else {
            this.ctx.fillStyle = config.handleColor;
        }
        
        this.ctx.fill();

        // White border
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Label for debugging (optional)
        if (isDragged || isHovered) {
            this.ctx.fillStyle = '#000000';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(
                `${controlPoint.type}`,
                controlPoint.point.x + config.handleRadius + 5,
                controlPoint.point.y - config.handleRadius
            );
        }
    }

    private lightenColor(color: string, percent: number): string {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    }

    // Public API methods for integration

    /**
     * Export the current path as SVG
     */
    exportSvg(): string {
        return this.manager.path.toSvgString();
    }

    /**
     * Export the current path as JSON (preserves all segment data)
     */
    exportJson(): string {
        return this.manager.path.toJson();
    }

    /**
     * Load a path from JSON
     */
    loadFromJson(json: string): void {
        try {
            const path = Path.fromJson(json);
            this.manager = new ControlPointManager(path, this.manager.config);
            this.manager.addMoveCallback((id, point) => {
                console.log(`Control point ${id} moved to (${point.x}, ${point.y})`);
                this.render();
            });
            this.render();
        } catch (error) {
            console.error('Failed to load path from JSON:', error);
        }
    }

    /**
     * Add a new segment to the path
     */
    addLine(start: { x: number; y: number }, end: { x: number; y: number }): void {
        const line = new Line(start, end);
        this.manager.addSegment(line);
        this.render();
    }

    /**
     * Add a cubic curve to the path
     */
    addCubicCurve(
        start: { x: number; y: number },
        control1: { x: number; y: number },
        control2: { x: number; y: number },
        end: { x: number; y: number }
    ): void {
        const curve = new CubicCurve(start, control1, control2, end);
        this.manager.addSegment(curve);
        this.render();
    }

    /**
     * Get information about the current path
     */
    getPathInfo(): { length: number; segmentCount: number; controlPointCount: number } {
        return {
            length: this.manager.path.getTotalLength(),
            segmentCount: this.manager.path.segments.length,
            controlPointCount: this.manager.getAllControlPoints().length
        };
    }
}

// Usage example:
/*
const canvas = document.getElementById('pathCanvas') as HTMLCanvasElement;
const editor = new InteractivePathEditor(canvas);

// Add UI controls
document.getElementById('exportSvg')?.addEventListener('click', () => {
    const svg = editor.exportSvg();
    console.log('Exported SVG:', svg);
});

document.getElementById('exportJson')?.addEventListener('click', () => {
    const json = editor.exportJson();
    console.log('Exported JSON:', json);
});

// Display path info
setInterval(() => {
    const info = editor.getPathInfo();
    document.getElementById('pathInfo')!.textContent = 
        `Length: ${info.length.toFixed(2)}, Segments: ${info.segmentCount}, Control Points: ${info.controlPointCount}`;
}, 100);
*/