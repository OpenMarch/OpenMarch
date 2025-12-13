# Improved Segmentation Methods

## Current Approach (Coordinate-Based)

**Problems:**

- Fixed quadrants (TL/TR/BL/BR) assume 2x2 grid layout
- Doesn't adapt to different page layouts
- Breaks when sheets aren't perfectly aligned
- Requires manual coordinate tuning

**Current Methods:**

1. `getQuadrantRects()` - Fixed 4-quadrant split
2. Anchor-based detection - Looks for "Performer:", "Printed" text
3. K-means clustering - Already used for columns (good!)

## Better Approaches

### 1. **Density-Based Clustering** (DBSCAN-like)

- Groups text by spatial proximity
- Adapts to any layout automatically
- No fixed coordinates needed
- **Best for:** Variable layouts, irregular spacing

### 2. **Gap Detection**

- Finds large whitespace gaps between text regions
- More robust than fixed quadrants
- Adapts to actual document structure
- **Best for:** Well-separated sheets with clear gaps

### 3. **Hybrid Approach** (Recommended)

- Combines anchor detection (semantic) + density clustering (spatial)
- Uses anchors when available, falls back to density
- Best of both worlds
- **Best for:** Most drill charts (has headers + spatial structure)

### 4. **Visual Separator Detection**

- Detects lines, borders, or visual boundaries
- Could use image processing on PDF
- Most accurate but more complex
- **Best for:** PDFs with visible borders/lines

## Implementation Status

Created `segment-improved.ts` with:

- ✅ `detectSheetsByDensity()` - Density-based clustering
- ✅ `detectSheetsByGaps()` - Gap detection
- ✅ `detectSheetsBySeparators()` - Visual separator detection
- ✅ `detectSheetsHybrid()` - Hybrid anchor + density (RECOMMENDED)

## Migration Path

1. **Phase 1**: Add hybrid detection as fallback
   - Keep current quadrant method
   - Use hybrid when quadrants fail

2. **Phase 2**: Make hybrid primary method
   - Use anchors when found
   - Fall back to density clustering
   - Keep quadrants as last resort

3. **Phase 3**: Remove coordinate-based methods
   - Fully semantic/spatial approach
   - Better accuracy, more robust

## Benefits

✅ **Adaptive** - Works with any layout  
✅ **Robust** - Handles irregular spacing  
✅ **Semantic** - Uses actual content (anchors)  
✅ **Spatial** - Uses actual positions (density)  
✅ **No tuning** - Fewer magic numbers

## EasyOCR Integration

EasyOCR already provides:

- Bounding boxes for each text region
- Confidence scores
- Layout-aware detection

We can leverage this for:

- Better gap detection (more accurate bboxes)
- Density clustering (better spatial data)
- Visual analysis (if we process the image)

## Recommendation

**Start with Hybrid Approach:**

1. Try anchor-based detection first (semantic)
2. If no anchors, use density clustering (spatial)
3. Keep quadrant method as absolute fallback

This gives best accuracy while maintaining backward compatibility.
