import { NewMarcherArgs } from "../../../src/global/classes/Marcher";
import { NewShapeArgs } from "../tables/ShapeTable";
import { NewShapePageArgs } from "../tables/ShapePageTable";
import { NewPageArgs } from "../tables/PageTable";

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
        start_beat: 6,
        notes: "This is the second page",
        is_subset: false,
    },
    {
        start_beat: 16,
        is_subset: false,
    },
    {
        start_beat: 12,
        is_subset: true,
    },
    {
        start_beat: 8,
        notes: "really good note",
        is_subset: false,
    },
    {
        start_beat: 4,
        is_subset: false,
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
                marcher_id: 3,
                x: 10,
                y: 20,
            },
            {
                marcher_id: 4,
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
