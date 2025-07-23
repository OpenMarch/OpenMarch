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
    final fieldWidth = fieldProperties.width;
    final fieldHeight = fieldProperties.height;
    final pixelsPerStep = fieldProperties.pixelsPerStep;
    final centerFrontPoint = fieldProperties.centerFrontPoint;

    // White background
    final backgroundPaint = Paint()
      ..color = fieldProperties.theme.background.toFlutterColor()
      ..style = PaintingStyle.fill;
    canvas.drawRect(
      Rect.fromLTWH(0, 0, fieldWidth, fieldHeight),
      backgroundPaint,
    );

    final sortedYCheckpoints = [
      ...fieldProperties.yCheckpoints,
    ]..sort((a, b) => b.stepsFromCenterFront.compareTo(a.stepsFromCenterFront));
    final firstVisibleYCheckpoint = fieldProperties.yCheckpoints.reduce((
      prev,
      curr,
    ) {
      if (curr.visible &&
          curr.stepsFromCenterFront > prev.stepsFromCenterFront) {
        return curr;
      }
      return prev;
    });

    var yCheckpointToStartGridFrom = sortedYCheckpoints[0];
    if (firstVisibleYCheckpoint.stepsFromCenterFront != 0 &&
        firstVisibleYCheckpoint.stepsFromCenterFront % 1 != 0) {
      yCheckpointToStartGridFrom = firstVisibleYCheckpoint;
    }

    // Grid lines
    if (showGridLines) {
      final gridPaint = Paint()
        ..color = fieldProperties.theme.tertiaryStroke.toFlutterColor()
        ..strokeWidth = FieldProperties.gridStrokeWidth;

      // X
      for (
        double i = centerFrontPoint['xPixels']!;
        i < fieldWidth;
        i += pixelsPerStep
      ) {
        canvas.drawLine(Offset(i, 0), Offset(i, fieldHeight), gridPaint);
      }
      for (
        double i = centerFrontPoint['xPixels']! - pixelsPerStep;
        i > 0;
        i -= pixelsPerStep
      ) {
        canvas.drawLine(Offset(i, 0), Offset(i, fieldHeight), gridPaint);
      }

      // Y
      for (
        double i =
            centerFrontPoint['yPixels']! +
            yCheckpointToStartGridFrom.stepsFromCenterFront * pixelsPerStep;
        i > 0;
        i -= pixelsPerStep
      ) {
        canvas.drawLine(Offset(0, i), Offset(fieldWidth, i), gridPaint);
      }
    }

    // Half lines
    if (showHalfLines) {
      final halfPaint = Paint()
        ..color = fieldProperties.theme.secondaryStroke.toFlutterColor()
        ..strokeWidth = FieldProperties.gridStrokeWidth;

      // X
      if (fieldProperties.halfLineXInterval > 0) {
        canvas.drawLine(
          Offset(centerFrontPoint['xPixels']!, 0),
          Offset(centerFrontPoint['xPixels']!, fieldHeight),
          halfPaint,
        );
        for (
          double i =
              centerFrontPoint['xPixels']! +
              pixelsPerStep * fieldProperties.halfLineXInterval;
          i < fieldWidth;
          i += pixelsPerStep * fieldProperties.halfLineXInterval
        ) {
          canvas.drawLine(Offset(i, 0), Offset(i, fieldHeight), halfPaint);
        }
        for (
          double i =
              centerFrontPoint['xPixels']! -
              pixelsPerStep * fieldProperties.halfLineXInterval;
          i > 0;
          i -= pixelsPerStep * fieldProperties.halfLineXInterval
        ) {
          canvas.drawLine(Offset(i, 0), Offset(i, fieldHeight), halfPaint);
        }
      }
      // Y
      if (fieldProperties.halfLineYInterval > 0) {
        for (
          double i =
              centerFrontPoint['yPixels']! +
              yCheckpointToStartGridFrom.stepsFromCenterFront * pixelsPerStep -
              pixelsPerStep * fieldProperties.halfLineYInterval;
          i > 0;
          i -= pixelsPerStep * fieldProperties.halfLineYInterval
        ) {
          canvas.drawLine(Offset(0, i), Offset(fieldWidth, i), halfPaint);
        }
      }
    }

    // Yard lines, field numbers, and hashes
    final xCheckpointPaint = Paint()
      ..color = fieldProperties.theme.primaryStroke.toFlutterColor()
      ..strokeWidth = FieldProperties.gridStrokeWidth;
    final yCheckpointPaint = Paint()
      ..color = fieldProperties.theme.primaryStroke.toFlutterColor()
      ..strokeWidth = FieldProperties.gridStrokeWidth * 3;
    final ySecondaryCheckpointPaint = Paint()
      ..color = fieldProperties.theme.secondaryStroke.toFlutterColor()
      ..strokeWidth = FieldProperties.gridStrokeWidth * 2;

    for (final xCheckpoint in fieldProperties.xCheckpoints) {
      if (!xCheckpoint.visible) continue;
      final x =
          centerFrontPoint['xPixels']! +
          xCheckpoint.stepsFromCenterFront * pixelsPerStep;
      canvas.drawLine(Offset(x, 0), Offset(x, fieldHeight), xCheckpointPaint);

      if (fieldProperties.useHashes) {
        const hashWidth = 20.0;
        for (final yCheckpoint in fieldProperties.yCheckpoints) {
          if (!yCheckpoint.visible) continue;
          final y =
              centerFrontPoint['yPixels']! +
              yCheckpoint.stepsFromCenterFront * pixelsPerStep -
              1;
          double x1 = x - hashWidth / 2;
          x1 = x1 < 0 ? 0 : x1;
          double x2 = x + hashWidth / 2;
          x2 = x2 > fieldWidth ? fieldWidth : x2;
          canvas.drawLine(
            Offset(x1, y),
            Offset(x2 + 1, y),
            yCheckpoint.useAsReference
                ? yCheckpointPaint
                : ySecondaryCheckpointPaint,
          );
        }
      }
    }

    if (!fieldProperties.useHashes) {
      for (final yCheckpoint in fieldProperties.yCheckpoints) {
        if (!yCheckpoint.visible) continue;
        final y =
            centerFrontPoint['yPixels']! +
            yCheckpoint.stepsFromCenterFront * pixelsPerStep;
        canvas.drawLine(Offset(0, y), Offset(fieldWidth, y), xCheckpointPaint);
      }
    }

    // Labels
    void drawText(
      String text,
      double x,
      double y, {
      Color color = Colors.black,
      double fontSize = 20.0,
      String fontFamily = 'mono',
      TextAlign textAlign = TextAlign.center,
      TextDirection textDirection = TextDirection.ltr,
      double rotation = 0.0,
    }) {
      final textSpan = TextSpan(
        text: text,
        style: TextStyle(
          color: color,
          fontSize: fontSize,
          fontFamily: fontFamily,
          fontWeight: FontWeight.normal,
        ),
      );
      final textPainter = TextPainter(
        text: textSpan,
        textAlign: textAlign,
        textDirection: textDirection,
      );
      textPainter.layout();
      if (rotation != 0.0) {
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(rotation);
        textPainter.paint(
          canvas,
          Offset(-textPainter.width / 2, -textPainter.height / 2),
        );
        canvas.restore();
      } else {
        textPainter.paint(
          canvas,
          Offset(x - textPainter.width / 2, y - textPainter.height / 2),
        );
      }
    }

    for (final xCheckpoint in fieldProperties.xCheckpoints) {
      if (!xCheckpoint.visible) continue;
      final x =
          centerFrontPoint['xPixels']! +
          xCheckpoint.stepsFromCenterFront * pixelsPerStep;
      final text = xCheckpoint.terseName;
      if (fieldProperties.bottomLabelsVisible) {
        drawText(
          text,
          x,
          centerFrontPoint['yPixels']! + 25,
          color: fieldProperties.theme.externalLabel.toFlutterColor(),
        );
      }
      if (fieldProperties.topLabelsVisible) {
        drawText(
          text,
          x,
          -25,
          color: fieldProperties.theme.externalLabel.toFlutterColor(),
        );
      }
    }

    for (final yCheckpoint in fieldProperties.yCheckpoints) {
      if (!yCheckpoint.visible) continue;
      final text = yCheckpoint.terseName;
      final y =
          centerFrontPoint['yPixels']! +
          yCheckpoint.stepsFromCenterFront * pixelsPerStep;
      const padding = 10.0;
      if (fieldProperties.leftLabelsVisible) {
        drawText(
          text,
          0 - padding,
          y,
          color: fieldProperties.theme.externalLabel.toFlutterColor(),
          textAlign: TextAlign.right,
        );
      }
      if (fieldProperties.rightLabelsVisible) {
        drawText(
          text,
          fieldWidth + padding,
          y,
          color: fieldProperties.theme.externalLabel.toFlutterColor(),
          textAlign: TextAlign.left,
        );
      }
    }

    // Yard Numbers
    final yardNumberCoordinates = fieldProperties.yardNumberCoordinates;
    if (yardNumberCoordinates.homeStepsFromFrontToInside != null &&
        yardNumberCoordinates.homeStepsFromFrontToOutside != null) {
      final numberHeight =
          (yardNumberCoordinates.homeStepsFromFrontToInside! -
              yardNumberCoordinates.homeStepsFromFrontToOutside!) *
          pixelsPerStep;
      const yardNumberXOffset = 22.0;

      for (final xCheckpoint in fieldProperties.xCheckpoints) {
        if (xCheckpoint.fieldLabel != null) {
          final x =
              centerFrontPoint['xPixels']! +
              xCheckpoint.stepsFromCenterFront * pixelsPerStep;
          if (yardNumberCoordinates.homeStepsFromFrontToInside != null &&
              yardNumberCoordinates.homeStepsFromFrontToOutside != null) {
            drawText(
              xCheckpoint.fieldLabel!,
              x - yardNumberXOffset,
              centerFrontPoint['yPixels']! -
                  yardNumberCoordinates.homeStepsFromFrontToInside! *
                      pixelsPerStep,
              color: fieldProperties.theme.fieldLabel.toFlutterColor(),
              fontSize: numberHeight,
            );
          }
          if (yardNumberCoordinates.awayStepsFromFrontToOutside != null &&
              yardNumberCoordinates.awayStepsFromFrontToInside != null) {
            drawText(
              xCheckpoint.fieldLabel!,
              x - yardNumberXOffset,
              centerFrontPoint['yPixels']! -
                  yardNumberCoordinates.awayStepsFromFrontToOutside! *
                      pixelsPerStep,
              color: fieldProperties.theme.fieldLabel.toFlutterColor(),
              fontSize: numberHeight,
              rotation: 3.14159,
            ); // Flip Y and X
          }
        }
      }
    }

    // Border
    final borderPaint = Paint()
      ..color = fieldProperties.theme.primaryStroke.toFlutterColor()
      ..strokeWidth = FieldProperties.gridStrokeWidth * 3;
    final borderWidth = borderPaint.strokeWidth;
    final borderOffset = 1 - borderWidth;
    // Back line
    canvas.drawLine(
      Offset(borderOffset, borderOffset),
      Offset(fieldWidth - borderOffset, borderOffset),
      borderPaint,
    );
    // Front line
    canvas.drawLine(
      Offset(borderOffset, fieldHeight),
      Offset(fieldWidth - borderOffset + 1, fieldHeight),
      borderPaint,
    );
    // Left line
    canvas.drawLine(
      Offset(borderOffset, borderOffset),
      Offset(borderOffset, fieldHeight - borderOffset),
      borderPaint,
    );
    // Right line
    canvas.drawLine(
      Offset(fieldWidth, borderOffset),
      Offset(fieldWidth, fieldHeight - borderOffset),
      borderPaint,
    );
  }

  @override
  bool shouldRepaint(covariant FieldGridPainter oldDelegate) {
    return showGridLines != oldDelegate.showGridLines ||
        showHalfLines != oldDelegate.showHalfLines ||
        fieldProperties != oldDelegate.fieldProperties;
  }
}
