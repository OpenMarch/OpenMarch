import { NewMarcherArgs } from "@/global/classes/Marcher";
import { NewPageArgs } from "@/global/classes/Page";
import { NewShapeArgs } from "../tables/ShapeTable";
import { NewShapePageArgs } from "../tables/ShapePageTable";

export const NewMarchers: NewMarcherArgs[] = [
    {
        name: "Marc Sylvester",
        section: "Flute",
        drill_prefix: "F",
        drill_order: 1,
        year: "Freshman",
    },
    {
        name: "George Zingali",
        section: "Snare",
        drill_prefix: "S",
        drill_order: 1,
        year: "Sophomore",
        notes: "Inducted in 1991 - DCI Hall of Fame (The AI made this note idk if it's true lol)",
    },
    {
        name: "John Bilby",
        section: "Trumpet",
        drill_prefix: "T",
        drill_order: 1,
        year: "Sophomore",
    },
    {
        section: "Baritone",
        drill_prefix: "B",
        drill_order: 2,
        year: "Sophomore",
    },
    {
        section: "Baritone",
        drill_prefix: "B",
        drill_order: 4,
        notes: "This is a note",
    },
];

export const NewPages: NewPageArgs[] = [
    {
        counts: 16,
        notes: "This is the second page",
        previousPageId: 0,
        isSubset: false,
    },
    {
        counts: 16,
        previousPageId: 0,
        isSubset: false,
    },
    {
        counts: 8,
        previousPageId: 0,
        isSubset: true,
    },
    {
        counts: 32,
        notes: "really good note",
        previousPageId: 0,
        isSubset: false,
    },
    {
        counts: 4,
        previousPageId: 0,
        isSubset: false,
    },
];

export const NewShapes: NewShapeArgs[] = [
    {
        name: "Shape 1",
    },
    {
        name: "Shape 2",
        notes: "This is a note",
    },
    {
        notes: "This is also a note",
    },
    {},
];

export const NewShapePages: NewShapePageArgs[] = [
    {
        shape_id: 1,
        page_id: 1,
        svg_path: "M 0 0 L 100 100",
        notes: "This is a note",
        marcher_coordinates: [
            {
                marcher_id: 1,
                x: 10,
                y: 20,
            },
            {
                marcher_id: 2,
                x: 30,
                y: 40,
            },
        ],
    },
    {
        shape_id: 2,
        page_id: 1,
        svg_path: "M 200 200 L 100 100",
        notes: null,
        marcher_coordinates: [
            {
                marcher_id: 1,
                x: 10,
                y: 20,
            },
            {
                marcher_id: 2,
                x: 30,
                y: 40,
            },
        ],
    },
    {
        shape_id: 2,
        page_id: 2,
        svg_path: "M 0 0 Q 150 150 780 500",
        marcher_coordinates: [
            {
                marcher_id: 1,
                x: 10,
                y: 20,
            },
            {
                marcher_id: 2,
                x: 30,
                y: 40,
            },
        ],
    },
    {
        shape_id: 1,
        page_id: 4,
        svg_path: "M 0 0 L 100 100",
        notes: "This is a note",
        marcher_coordinates: [
            {
                marcher_id: 1,
                x: 10,
                y: 20,
            },
            {
                marcher_id: 2,
                x: 30,
                y: 40,
            },
        ],
    },
];
