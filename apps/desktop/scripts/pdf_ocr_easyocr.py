#!/usr/bin/env python3
"""
High-performance PDF OCR using EasyOCR with GPU acceleration support.
Called from Electron main process for best accuracy and performance.
"""

import sys
import json
import base64
from io import BytesIO

try:
    import easyocr
    from pdf2image import convert_from_bytes
    from PIL import Image
    import numpy as np
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}"}), file=sys.stderr)
    sys.exit(1)


def detect_gpu():
    """Detect if GPU is available for faster processing."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def main():
    """Main OCR processing function."""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: pdf_ocr_easyocr.py <page_index> [dpi]"}))
        sys.exit(1)

    page_index = int(sys.argv[1])
    dpi = int(sys.argv[2]) if len(sys.argv) > 2 else 300

    # Read PDF data from stdin
    try:
        pdf_bytes = sys.stdin.buffer.read()
        if not pdf_bytes:
            print(json.dumps({"error": "No PDF data provided"}))
            sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Failed to read PDF: {e}"}))
        sys.exit(1)

    # Initialize EasyOCR reader (reuse if possible, but for now create new)
    # GPU detection for better performance
    use_gpu = detect_gpu()
    try:
        reader = easyocr.Reader(['en'], gpu=use_gpu, verbose=False)
    except Exception as e:
        print(json.dumps({"error": f"Failed to initialize EasyOCR: {e}"}))
        sys.exit(1)

    # Convert PDF page to image
    # pdf2image uses 1-based page indexing, so page_index 0 = page 1
    try:
        images = convert_from_bytes(pdf_bytes, dpi=dpi, first_page=page_index + 1, last_page=page_index + 1)
        if not images or len(images) == 0:
            print(json.dumps({"error": f"Page {page_index} (1-based: {page_index + 1}) not found in PDF"}))
            sys.exit(1)
        
        image = images[0]
    except Exception as e:
        print(json.dumps({"error": f"Failed to convert PDF page: {e}"}))
        sys.exit(1)

    # Convert PIL Image to numpy array (EasyOCR requires numpy array)
    try:
        image_array = np.array(image)
    except Exception as e:
        print(json.dumps({"error": f"Failed to convert image to numpy array: {e}"}))
        sys.exit(1)

    # Run OCR with optimized parameters for drill chart parsing
    # width_ths and height_ths control when to merge text regions
    # Lower values = more granular (individual words), higher = phrases
    # For drill charts, we want word-level detection for better column parsing
    try:
        result = reader.readtext(
            image_array,
            detail=1,
            paragraph=False,
            width_ths=0.7,  # Lower threshold = split wider detections
            height_ths=0.7,  # Lower threshold = split taller detections
            slope_ths=0.1,  # Text alignment threshold
        )
    except Exception as e:
        print(json.dumps({"error": f"OCR failed: {e}"}))
        sys.exit(1)

    # Format output to match internal OCR structure
    words = []
    for detection in result:
        bbox, text, conf = detection
        # bbox is [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
        # Convert to x0, y0, x1, y1 format
        x_coords = [point[0] for point in bbox]
        y_coords = [point[1] for point in bbox]
        x0 = min(x_coords)
        y0 = min(y_coords)
        x1 = max(x_coords)
        y1 = max(y_coords)

        words.append({
            "str": text.strip(),
            "x": float(x0),
            "y": float(y0),
            "w": float(x1 - x0),
            "h": float(y1 - y0),
            "conf": float(conf) if conf is not None else 1.0
        })

    # Output JSON result
    output = {
        "words": words,
        "gpu_used": use_gpu,
        "dpi": dpi,
        "word_count": len(words)
    }
    
    print(json.dumps(output))
    sys.exit(0)


if __name__ == "__main__":
    main()

