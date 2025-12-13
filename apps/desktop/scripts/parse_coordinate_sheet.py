#!/usr/bin/env python3
"""
Coordinate Sheet Parser for OpenMarch
Extracts performer coordinate sets from PDF pages using PyMuPDF (fitz) with OCR fallback.

Usage: parse_coordinate_sheet.py <page_index> [dpi]
Input: PDF binary from stdin
Output: JSON with extracted sheets and sets
"""

import sys
import json
import re
import fitz  # PyMuPDF
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

# Regex patterns
REGEX_PERFORMER_LABEL = re.compile(r"Label:\s*(?P<label>[A-Za-z0-9]+)", re.IGNORECASE)
REGEX_PERFORMER_NAME = re.compile(r"Performer:\s*(?P<name>.*?)(?:\s+Label:|\s+ID:|$)", re.IGNORECASE)
REGEX_PRINTED_PAGE = re.compile(r"Page\s+(?P<page>\d+)\s+of\s+\d+", re.IGNORECASE)
REGEX_HEADER_START = re.compile(r"^Set\s+Measure\s+Counts", re.IGNORECASE)
REGEX_ROW_START = re.compile(r"^(?P<set_id>\d+[A-Z]?)\s+(?P<rest>.*)", re.IGNORECASE)

# Constants
MIN_TEXT_LENGTH_THRESHOLD = 200
Y_TOLERANCE = 3.0  # Points for line reconstruction

def log_debug(msg):
    # Print to stderr so it doesn't corrupt stdout JSON
    print(f"[DEBUG] {msg}", file=sys.stderr)

def get_page_center(page) -> Tuple[float, float]:
    rect = page.rect
    return rect.width / 2, rect.height / 2

def assign_quadrant(x, y, x_mid, y_mid) -> int:
    """
    Returns quadrant index:
    1: Top-Left
    2: Top-Right
    3: Bottom-Left
    4: Bottom-Right
    """
    if y < y_mid:
        return 1 if x < x_mid else 2
    else:
        return 3 if x < x_mid else 4

def sort_words_in_quadrant(words: List[Dict]) -> List[Dict]:
    """
    Sort words primarily by Y (with tolerance), then by X.
    words structure from fitz: [x0, y0, x1, y1, "text", block_no, line_no, word_no]
    """
    # Sort by Y first
    words.sort(key=lambda w: w[1])
    
    # Group by lines with tolerance
    lines = []
    current_line = []
    
    if not words:
        return []
        
    current_y = words[0][1]
    
    for word in words:
        if abs(word[1] - current_y) > Y_TOLERANCE:
            # New line
            # Sort current line by X
            current_line.sort(key=lambda w: w[0])
            lines.extend(current_line)
            current_line = []
            current_y = word[1]
        
        current_line.append(word)
    
    # Append last line
    current_line.sort(key=lambda w: w[0])
    lines.extend(current_line)
    
    return lines

def reconstruct_reading_order(page, words_raw) -> List[Dict]:
    """
    Reconstructs reading order by splitting into quadrants and sorting.
    words_raw: List of fitz words
    """
    x_mid, y_mid = get_page_center(page)
    
    quadrants = {1: [], 2: [], 3: [], 4: []}
    
    for w in words_raw:
        # w is (x0, y0, x1, y1, "text", ...)
        x0, y0, x1, y1 = w[:4]
        cx = (x0 + x1) / 2
        cy = (y0 + y1) / 2
        q = assign_quadrant(cx, cy, x_mid, y_mid)
        quadrants[q].append(w)
    
    ordered_words = []
    for q in [1, 2, 3, 4]:
        ordered_words.extend(sort_words_in_quadrant(quadrants[q]))
        
    return ordered_words

def words_to_lines(ordered_words) -> List[str]:
    """
    Convert sorted words into lines of text.
    """
    lines = []
    current_line_words = []
    
    if not ordered_words:
        return []
        
    current_y = ordered_words[0][1]
    
    for w in ordered_words:
        # Check if new line (Y diff > tolerance)
        if abs(w[1] - current_y) > Y_TOLERANCE:
            if current_line_words:
                lines.append(" ".join([wd[4] for wd in current_line_words]))
            current_line_words = []
            current_y = w[1]
        current_line_words.append(w)
        
    if current_line_words:
        lines.append(" ".join([wd[4] for wd in current_line_words]))
        
    return lines

def parse_set_row(line: str) -> Optional[Dict]:
    """
    Parses a single line into set data.
    """
    # 1. Identify set ID
    match = REGEX_ROW_START.match(line)
    if not match:
        return None
        
    set_id = match.group("set_id")
    remainder = match.group("rest").strip()
    
    if not remainder:
        return None
        
    tokens = remainder.split()
    if not tokens:
        return None
        
    # 2. Smart Parse Measure/Counts
    measure_range = ""
    counts = None
    coord_start_idx = 0
    
    if len(tokens) >= 2:
        val0 = tokens[0]
        val1 = tokens[1]
        
        # Check if values look like integers (counts/measure numbers) vs ranges/text
        is_val0_int = val0.replace(".", "", 1).isdigit()
        is_val1_int = val1.replace(".", "", 1).isdigit()
        
        if is_val0_int and is_val1_int:
            # Case: "1 16" -> Measure 1, Counts 16
            measure_range = val0
            counts = int(float(val1))
            coord_start_idx = 2
        elif not is_val0_int and is_val1_int:
            # Case: "1-4 16" -> Measure 1-4, Counts 16
            measure_range = val0
            counts = int(float(val1))
            coord_start_idx = 2
        elif is_val0_int and not is_val1_int:
            # Case: "16 Side..." -> Counts 16 (implied measure) OR Measure 16 (missing counts)
            # Heuristic: Counts are usually 4, 8, 12, 16, 20...
            # If we have to choose, usually single number in this context is counts (duration)
            counts = int(float(val0))
            measure_range = "" # Unknown measure
            coord_start_idx = 1
        else:
            # Case: "1-4 Side..." -> Measure 1-4, missing counts
            measure_range = val0
            coord_start_idx = 1
    elif len(tokens) == 1:
        # Only one token total?
        val0 = tokens[0]
        if val0.replace(".", "", 1).isdigit():
            counts = int(float(val0))
        else:
            measure_range = val0
        coord_start_idx = 1
    
    # 3. Coordinate text
    coord_tokens = tokens[coord_start_idx:]
    coord_text = " ".join(coord_tokens)
    
    # Split X vs Y
    # Looking for boundary between "Side ... yard line" and "steps ... Hash"
    # Heuristic: Find split point
    # Common patterns: "... Side ... line" followed by "... steps ... Hash" or "On ... Hash"
    
    side_text = ""
    fb_text = ""
    
    # Try to find split markers
    # "Hash" is a strong indicator for end of FB part or start of it?
    # Usually: "On 50 yd ln 4.0 steps behind Front Hash"
    # Actually "Side 1-Side 2" and "Front-Back" are usually separate columns visually.
    # In text stream, they might be merged.
    # Example: "2.5 steps inside Side 1 50 yd ln 4.0 steps behind Front Hash"
    
    # Simple heuristic: Split on "yd ln" or "yd line"
    split_indices = [i for i, t in enumerate(coord_tokens) if t.lower() in ["ln", "line"]]
    
    if split_indices:
        # Split after "ln"
        idx = split_indices[0] + 1
        side_text = " ".join(coord_tokens[:idx])
        fb_text = " ".join(coord_tokens[idx:])
    else:
        # Fallback: look for "steps" if it appears twice?
        # Or look for Hash
        hash_indices = [i for i, t in enumerate(coord_tokens) if "hash" in t.lower()]
        if hash_indices:
            # If hash is at the end, maybe split somewhere before?
            # This is hard without more examples. 
            # Strategy from prompt: "If no clean split, keep full remainder... and flag"
            # We'll put everything in side_text if we can't split, and leave fb_text empty
            side_text = coord_text
            
    return {
        "set_id": set_id,
        "measure_range": measure_range,
        "counts": counts,
        "side_text": side_text,
        "fb_text": fb_text,
        "raw_coords": coord_text
    }

def process_text_content(text_lines: List[str]) -> List[Dict]:
    """
    Processes lines of text to identify blocks and parse them.
    """
    blocks = []
    current_lines = []
    
    # Detect boundaries using robust split logic
    for line in text_lines:
        # log_debug(f"Line: {line}")
        is_performer = "Performer:" in line
        is_printed = "Printed:" in line
        
        # Split on new Performer if we have existing lines
        if is_performer and current_lines:
             blocks.append(current_lines)
             current_lines = []
        
        current_lines.append(line)
        
        if is_printed:
             if current_lines:
                 blocks.append(current_lines)
             current_lines = []
             
    if current_lines:
        blocks.append(current_lines)
        
    # Stitching Blocks
    stitched_blocks = []
    if not blocks:
        return []

    # Parse metadata for all blocks first to help with stitching
    parsed_blocks_meta = []
    for block_lines in blocks:
        block_text = "\n".join(block_lines)
        label_match = REGEX_PERFORMER_LABEL.search(block_text)
        name_match = REGEX_PERFORMER_NAME.search(block_text)
        page_match = REGEX_PRINTED_PAGE.search(block_text)
        has_header = any("Set Measure Counts" in line for line in block_lines)
        
        parsed_blocks_meta.append({
            "label": label_match.group("label") if label_match else None,
            "name": name_match.group("name").strip() if name_match else None,
            "page": int(page_match.group("page")) if page_match else None,
            "has_header": has_header,
            "lines": block_lines
        })
        
    # Apply Stitching Rules
    i = 0
    while i < len(parsed_blocks_meta):
        current = parsed_blocks_meta[i]
        
        if i + 1 < len(parsed_blocks_meta):
            next_b = parsed_blocks_meta[i+1]
            
            should_merge = False
            
            # Rule A: Same label + consecutive pages
            if (current["label"] and next_b["label"] and 
                current["label"] == next_b["label"] and 
                current["page"] and next_b["page"] and 
                next_b["page"] == current["page"] + 1):
                should_merge = True
                log_debug(f"Merging blocks Rule A: {current['label']} p{current['page']} -> p{next_b['page']}")
                
            # Rule B: Missing header at start + row-like lines (Continuation)
            elif (not next_b["has_header"] and 
                  len(next_b["lines"]) > 0 and 
                  REGEX_ROW_START.match(next_b["lines"][0])):
                
                # Rule B says: "If a block starts without header... merge if previous block had same label"
                if current["label"] and next_b["label"] and current["label"] == next_b["label"]:
                    should_merge = True
                    log_debug("Merging blocks Rule B (Same Label)")
                elif not next_b["label"]:
                    # Next block has no label (maybe just rows), assume continuation
                    should_merge = True
                    log_debug("Merging blocks Rule B (No Label in Next)")
            
            if should_merge:
                # Merge content
                current["lines"].extend(next_b["lines"])
                # Keep label/name from first block unless missing
                if not current["label"] and next_b["label"]:
                    current["label"] = next_b["label"]
                if not current["name"] and next_b["name"]:
                    current["name"] = next_b["name"]
                # Update page from next block if current missing? Or keep range?
                # Usually we want the *first* page if it's the start, but maybe keep track of range
                
                # Remove next_b from processing
                del parsed_blocks_meta[i+1]
                continue # Re-evaluate current against new next
        
        stitched_blocks.append(current)
        i += 1
        
    # Final Parsing of Stitched Blocks
    results = []
    for b in stitched_blocks:
        lines = b["lines"]
        full_text = "\n".join(lines)
        
        # Re-parse meta (might have changed after merge? unlikely for label)
        label_match = REGEX_PERFORMER_LABEL.search(full_text)
        name_match = REGEX_PERFORMER_NAME.search(full_text)
        page_match = REGEX_PRINTED_PAGE.search(full_text)
        
        label = label_match.group("label") if label_match else b["label"]
        name = name_match.group("name").strip() if name_match else b["name"]
        printed_page = int(page_match.group("page")) if page_match else b["page"]
        
        if not label:
            # Skip blocks with no performer label (probably noise)
            continue
            
        sets = []
        for line in lines:
            row_data = parse_set_row(line)
            if row_data:
                sets.append(row_data)
            elif REGEX_ROW_START.match(line):
                log_debug(f"Failed to parse row: {line}")
                
        results.append({
            "performer_label": label,
            "performer_name": name,
            "printed_page_number": printed_page,
            "sets": sets,
        })
        
    return results

def run_ocr_fallback(page, dpi) -> List[str]:
    """
    Renders quadrants and runs EasyOCR.
    Returns list of text lines.
    """
    log_debug("Running OCR fallback...")
    try:
        import easyocr
    except ImportError:
        log_debug("EasyOCR not installed or import failed.")
        return []

    try:
        reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    except Exception as e:
        log_debug(f"Failed to init EasyOCR: {e}")
        return []

    x_mid, y_mid = get_page_center(page)
    rect = page.rect
    
    # Define quadrants
    quad_rects = [
        fitz.Rect(0, 0, x_mid, y_mid),          # TL
        fitz.Rect(x_mid, 0, rect.width, y_mid), # TR
        fitz.Rect(0, y_mid, x_mid, rect.height), # BL
        fitz.Rect(x_mid, y_mid, rect.width, rect.height) # BR
    ]
    
    all_lines = []
    
    for q_rect in quad_rects:
        pix = page.get_pixmap(matrix=fitz.Matrix(dpi/72, dpi/72), clip=q_rect)
        # Convert to numpy
        # pix.samples is bytes
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
        if pix.n == 4: # RGBA -> RGB
            img_array = img_array[..., :3]
            
        try:
            # EasyOCR readtext
            results = reader.readtext(img_array, detail=1, paragraph=False)
            
            # Convert to words format for sorting logic: [x0, y0, x1, y1, text]
            # EasyOCR bbox: [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
            q_words = []
            for bbox, text, conf in results:
                xs = [p[0] for p in bbox]
                ys = [p[1] for p in bbox]
                q_words.append([min(xs), min(ys), max(xs), max(ys), text])
            
            # Sort words in this quadrant
            sorted_q_words = sort_words_in_quadrant(q_words)
            
            # Convert to lines
            q_lines = words_to_lines(sorted_q_words)
            all_lines.extend(q_lines)
            
        except Exception as e:
            log_debug(f"OCR failed for quadrant: {e}")
            
    return all_lines

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: parse_coordinate_sheet.py <page_index> [dpi]"}), file=sys.stderr)
        sys.exit(1)
        
    try:
        page_index = int(sys.argv[1])
        dpi = int(sys.argv[2]) if len(sys.argv) > 2 else 300
        
        pdf_bytes = sys.stdin.buffer.read()
        if not pdf_bytes:
            print(json.dumps({"error": "No PDF data provided"}), file=sys.stderr)
            sys.exit(1)
            
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if page_index >= len(doc):
             print(json.dumps({"error": f"Page index {page_index} out of range"}), file=sys.stderr)
             sys.exit(1)
             
        page = doc[page_index]
        
        # 1. Text Extraction
        words = page.get_text("words") # (x0, y0, x1, y1, "word", block_no, line_no, word_no)
        
        text_lines = []
        
        # Calculate total text length
        total_chars = sum(len(w[4]) for w in words)
        
        if total_chars > MIN_TEXT_LENGTH_THRESHOLD:
            ordered_words = reconstruct_reading_order(page, words)
            text_lines = words_to_lines(ordered_words)
        else:
            text_lines = run_ocr_fallback(page, dpi)
            
        # 2. Process Content
        extracted_sheets = process_text_content(text_lines)
        
        # 3. Add debug info
        for sheet in extracted_sheets:
            sheet["physical_pdf_page_index"] = page_index
            
        # 4. Validation
        full_text = "\n".join(text_lines)
        performer_count = full_text.count("Performer:")
        labels_found = len(set(s["performer_label"] for s in extracted_sheets))
        
        output = {
            "sheets": extracted_sheets,
            "debug": {
                "performer_marker_count": performer_count,
                "extracted_labels_count": labels_found,
                "text_source": "text" if total_chars > MIN_TEXT_LENGTH_THRESHOLD else "ocr"
            }
        }
        
        print(json.dumps(output, indent=2))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

