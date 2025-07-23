import 'package:flutter/material.dart';
import 'package:otm/models/from_desktop/field_properties.dart';

class FieldGridPainter extends CustomPainter {
  final bool showGridLines;
  final bool showHalfLines;
  final FieldProperties fieldProperties;

  FieldGridPainter({
    required this.fieldProperties,
    this.showGridLines = true,
    this.showHalfLines = true,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final pixelsPerStep = fieldProperties.pixelsPerStep;
    debugPrint('Field Properties:');
    debugPrint('Name: ${fieldProperties.name}');
    debugPrint(
      'Width: ${fieldProperties.width} pixels (${fieldProperties.prettyWidth})',
    );
    debugPrint(
      'Height: ${fieldProperties.height} pixels (${fieldProperties.prettyHeight})',
    );
    debugPrint(
      'Step Size: ${fieldProperties.stepSizeInches} inches (${fieldProperties.stepSizeInUnits} ${fieldProperties.measurementSystem == MeasurementSystem.imperial ? "inches" : "cm"})',
    );
    debugPrint('Pixels per Step: ${fieldProperties.pixelsPerStep}');
    debugPrint(
      'Number of X Checkpoints: ${fieldProperties.xCheckpoints.length}',
    );
    debugPrint(
      'Number of Y Checkpoints: ${fieldProperties.yCheckpoints.length}',
    );

    final gridPaint = Paint()
      ..color = Colors.grey[400]!
      ..strokeWidth = 1;

    final halfPaint = Paint()
      ..color = Colors.grey[700]!
      ..strokeWidth = 2;

    if (showGridLines) {
      for (double x = 0; x <= size.width; x += pixelsPerStep) {
        canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
      }
      for (double y = 0; y <= size.height; y += pixelsPerStep) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
      }
    }

    if (showHalfLines) {
      for (double x = 0; x <= size.width; x += pixelsPerStep * 4) {
        canvas.drawLine(Offset(x, 0), Offset(x, size.height), halfPaint);
      }
      for (double y = 0; y <= size.height; y += pixelsPerStep * 4) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), halfPaint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant FieldGridPainter oldDelegate) {
    return showGridLines != oldDelegate.showGridLines ||
        showHalfLines != oldDelegate.showHalfLines;
  }
}
