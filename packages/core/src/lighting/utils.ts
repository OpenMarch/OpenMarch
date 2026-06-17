import { z } from "zod";

export const ColorSchema = z.string().regex(/^#([0-9a-fA-F]{6})$/);
