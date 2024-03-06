// import { Marcher } from "./Marcher";

// /**
//  * A CanvasMarcher is the object used on the canvas to represent a marcher.
//  * It includes things such as the fabric objects and other canvas-specific properties.
//  */
// export class CanvasMarcher extends Marcher {
//     fabricObject: fabric.Object;

//     constructor(marcher: Marcher, fabricObject: fabric.Object) {
//         super(marcher);
//         this.fabricObject = fabricObject;
//     }

//     setNextAnimation(x: number, y: number, tempo: number) {
//         const duration = tempoToDuration(tempo);
//         this.fabricObject.animate('left', x, {
//             duration: duration,
//             onChange: this.canvas.renderAll.bind(this.canvas),
//             easing: fabric.util.ease.easeOutBounce
//         });
//         this.fabricObject.animate('top', y, {
//             duration: duration,
//             onChange: this.canvas.renderAll.bind(this.canvas),
//             easing: fabric.util.ease.easeOutBounce
//         });
//     }
// }

// function tempoToDuration(tempo: number) {
//     return 60 / tempo * 1000;
// }
