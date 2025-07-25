import { IPathSegment, Point, SegmentJsonData } from '../interfaces';

/**
 * Represents an arc segment defined by center, radius, start angle, and end angle.
 */
export class Arc implements IPathSegment {
    readonly type = 'arc';
    
    constructor(
        public readonly center: Point,
        public readonly radius: number,
        public readonly startAngle: number, // in radians
        public readonly endAngle: number,   // in radians
        public readonly clockwise: boolean = true
    ) {}

    getLength(): number {
        let angleDiff = this.endAngle - this.startAngle;
        if (!this.clockwise) {
            angleDiff = -angleDiff;
        }
        // Normalize to positive value
        if (angleDiff < 0) {
            angleDiff += 2 * Math.PI;
        }
        return Math.abs(angleDiff * this.radius);
    }

    getPointAtLength(dist: number): Point {
        const totalLength = this.getLength();
        if (totalLength === 0) return this.getStartPoint();
        
        const t = Math.max(0, Math.min(1, dist / totalLength));
        let angleDiff = this.endAngle - this.startAngle;
        if (!this.clockwise) {
            angleDiff = -angleDiff;
        }
        if (angleDiff < 0) {
            angleDiff += 2 * Math.PI;
        }
        
        const currentAngle = this.startAngle + t * angleDiff * (this.clockwise ? 1 : -1);
        
        return {
            x: this.center.x + this.radius * Math.cos(currentAngle),
            y: this.center.y + this.radius * Math.sin(currentAngle)
        };
    }

    getStartPoint(): Point {
        return {
            x: this.center.x + this.radius * Math.cos(this.startAngle),
            y: this.center.y + this.radius * Math.sin(this.startAngle)
        };
    }

    getEndPoint(): Point {
        return {
            x: this.center.x + this.radius * Math.cos(this.endAngle),
            y: this.center.y + this.radius * Math.sin(this.endAngle)
        };
    }

    toSvgString(): string {
        const startPoint = this.getStartPoint();
        const endPoint = this.getEndPoint();
        
        let angleDiff = this.endAngle - this.startAngle;
        if (!this.clockwise) {
            angleDiff = -angleDiff;
        }
        if (angleDiff < 0) {
            angleDiff += 2 * Math.PI;
        }
        
        const largeArcFlag = angleDiff > Math.PI ? 1 : 0;
        const sweepFlag = this.clockwise ? 1 : 0;
        
        return `M ${startPoint.x} ${startPoint.y} A ${this.radius} ${this.radius} 0 ${largeArcFlag} ${sweepFlag} ${endPoint.x} ${endPoint.y}`;
    }

    toJson(): SegmentJsonData {
        return {
            type: this.type,
            data: {
                center: { ...this.center },
                radius: this.radius,
                startAngle: this.startAngle,
                endAngle: this.endAngle,
                clockwise: this.clockwise
            }
        };
    }

    fromJson(data: SegmentJsonData): IPathSegment {
        if (data.type !== 'arc') {
            throw new Error(`Cannot create Arc from data of type ${data.type}`);
        }
        return new Arc(
            data.data.center,
            data.data.radius,
            data.data.startAngle,
            data.data.endAngle,
            data.data.clockwise
        );
    }

    static fromJson(data: SegmentJsonData): Arc {
        const instance = new Arc({ x: 0, y: 0 }, 0, 0, 0);
        return instance.fromJson(data) as Arc;
    }
}