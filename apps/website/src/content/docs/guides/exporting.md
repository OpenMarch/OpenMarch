---
title: "Exporting Charts"
description: "How to export coordinate sheets and drill charts"
sidebar:
  order: 100
---

Export coordinate sheets and drill charts from the `File` menu by clicking `Export`.

![Export modal](/docs/guides/exporting/exportModal.png)

## Coordinate Sheets

Generate PDF coordinate sheets for individual marchers or your entire ensemble.

### Export Options

- **Include measures** - Add measure numbers to each page
- **Abbreviate coordinate descriptions** - Use short form like "S1: 2 out 45" instead of "Side 1: 2 steps outside 45 yard line"
- **Use X/Y headers** - Replace "Side to Side" and "Front to Back" with "X" and "Y"
- **Quarter-page layout** - Fit 4 marchers per page (automatically enables abbreviations)
- **Organize by Section** - Create separate PDFs for each section, or one large PDF in score order
- **Coordinate rounding** - Round coordinates to nearest whole, half, quarter, or tenth step

### Output

![Coordinate Sheets](/docs/guides/exporting/coordSheet.png)

## Drill Charts

Export visual drill charts showing marcher positions and movement paths.

### Export Options

- **Individual Drill Charts** - Create personalized charts for each marcher showing their specific movements, or generate one overview chart for the entire ensemble

### Individual Charts

Each marcher gets their own PDF with:

- Their position highlighted on each page
- Previous position marked with a blue square
- Next position marked with a purple circle
- Movement paths drawn between positions
- Readable coordinates listed for reference

#### Output

![Drill Charts](/docs/guides/exporting/drillChart.png)

### Overview Charts

Single PDF showing all marchers on each page without individual pathways.

## Requirements

Both export types require:

- At least one marcher
- At least one non-default page

Missing requirements will show an error in the preview area, or you won't be able to export.
