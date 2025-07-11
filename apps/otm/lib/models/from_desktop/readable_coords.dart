import 'field_properties.dart';
import 'marcher_page.dart';

enum XDescription { inside, outside, on }

enum YDescription { on, inFrontOf, behind }

class ReadableCoords {
  static late FieldProperties _fieldProperties;

  final double originalX;
  final double originalY;
  final double xSteps;
  final double ySteps;
  final Checkpoint xCheckpoint;
  final Checkpoint yCheckpoint;
  final String sideDescription;
  final XDescription xDescription;
  final YDescription yDescription;
  final int roundingDenominator;

  ReadableCoords({
    required double x,
    required double y,
    this.roundingDenominator = 100,
  }) : originalX = x,
       originalY = y,
       assert(roundingDenominator > 0, "roundingDenominator must be > 0"),
       xSteps = _parseCanvasCoords(x, y, roundingDenominator).xSteps,
       ySteps = _parseCanvasCoords(x, y, roundingDenominator).ySteps,
       xCheckpoint = _parseCanvasCoords(x, y, roundingDenominator).xCheckpoint,
       yCheckpoint = _parseCanvasCoords(x, y, roundingDenominator).yCheckpoint,
       sideDescription = _parseCanvasCoords(
         x,
         y,
         roundingDenominator,
       ).sideDescription,
       xDescription = _parseCanvasCoords(
         x,
         y,
         roundingDenominator,
       ).xDescription,
       yDescription = _parseCanvasCoords(
         x,
         y,
         roundingDenominator,
       ).yDescription;

  static void setFieldProperties(FieldProperties fieldProps) {
    _fieldProperties = fieldProps;
  }

  static FieldProperties getFieldProperties() => _fieldProperties;

  static ReadableCoords fromMarcherPage(
    MarcherPage page, {
    int roundingDenominator = 100,
  }) {
    return ReadableCoords(
      x: page.x,
      y: page.y,
      roundingDenominator: roundingDenominator,
    );
  }

  static _ParsedValues _parseCanvasCoords(
    double x,
    double y,
    int roundingDenominator,
  ) {
    final props = _fieldProperties;
    final double pxPerStep = props.pixelsPerStep;

    double xStepsFromCenter =
        ((x - (props.centerFrontPoint['xPixels'] ?? 0.0)) / pxPerStep);
    double yStepsFromCenter =
        ((y - (props.centerFrontPoint['yPixels'] ?? 0.0)) / pxPerStep);

    xStepsFromCenter =
        (xStepsFromCenter * roundingDenominator).round() / roundingDenominator;
    yStepsFromCenter =
        (yStepsFromCenter * roundingDenominator).round() / roundingDenominator;

    final sideDesc = xStepsFromCenter == 0
        ? ""
        : xStepsFromCenter < 0
        ? props.sideDescriptions.terseLeft
        : props.sideDescriptions.terseRight;

    final xCheckpoint = _findClosestCheckpoint(
      xStepsFromCenter,
      props.xCheckpoints,
    );
    final deltaX =
        xCheckpoint.stepsFromCenterFront.abs() - xStepsFromCenter.abs();
    final xDescription = deltaX == 0
        ? XDescription.on
        : deltaX < 0
        ? XDescription.outside
        : XDescription.inside;

    final yCheckpoint = _findClosestCheckpoint(
      yStepsFromCenter,
      props.yCheckpoints,
    );
    final deltaY = yCheckpoint.stepsFromCenterFront - yStepsFromCenter;
    final yDescription = deltaY == 0
        ? YDescription.on
        : deltaY < 0
        ? YDescription.inFrontOf
        : YDescription.behind;

    return _ParsedValues(
      xCheckpoint: xCheckpoint,
      yCheckpoint: yCheckpoint,
      sideDescription: sideDesc,
      xDescription: xDescription,
      yDescription: yDescription,
      xSteps: deltaX.abs(),
      ySteps: deltaY.abs(),
    );
  }

  static Checkpoint _findClosestCheckpoint(
    double value,
    List<Checkpoint> checkpoints,
  ) {
    return checkpoints.where((c) => c.useAsReference).reduce((a, b) {
      final aDist = (a.stepsFromCenterFront - value).abs();
      final bDist = (b.stepsFromCenterFront - value).abs();
      if (aDist < bDist) return a;
      if (aDist > bDist) return b;
      return a.stepsFromCenterFront.abs() < b.stepsFromCenterFront.abs()
          ? a
          : b;
    });
  }

  @override
  String toString() => "${toVerboseStringX()} - ${toVerboseStringY()}";

  bool isFieldCenter() => xCheckpoint.stepsFromCenterFront == 0 && xSteps == 0;

  String toVerboseStringX({bool includeStepsString = false}) {
    final steps = _formatStepsString(xSteps, includeStepsString);
    return "${sideDescription.isNotEmpty ? "$sideDescription: " : ""}$steps${_xDescriptionText(xDescription)} ${xCheckpoint.name}";
  }

  String toVerboseStringY({bool includeStepsString = false}) {
    final steps = _formatStepsString(ySteps, includeStepsString);
    return "$steps${_yDescriptionText(yDescription)} ${yCheckpoint.name}";
  }

  String toTerseStringX() {
    return "${sideDescription.isNotEmpty ? "$sideDescription: " : ""}${_formatStepsString(xSteps)}${_xDescriptionShort(xDescription)} ${xCheckpoint.terseName}";
  }

  String toTerseStringY() {
    return "${_formatStepsString(ySteps)}${_yDescriptionShort(yDescription)} ${yCheckpoint.terseName}";
  }

  static String _xDescriptionText(XDescription d) {
    switch (d) {
      case XDescription.inside:
        return "inside";
      case XDescription.outside:
        return "outside";
      case XDescription.on:
        return "On";
    }
  }

  static String _yDescriptionText(YDescription d) {
    switch (d) {
      case YDescription.inFrontOf:
        return "in front of";
      case YDescription.behind:
        return "behind";
      case YDescription.on:
        return "On";
    }
  }

  static String _xDescriptionShort(XDescription d) {
    switch (d) {
      case XDescription.inside:
        return "IN";
      case XDescription.outside:
        return "OUT";
      case XDescription.on:
        return "On";
    }
  }

  static String _yDescriptionShort(YDescription d) {
    switch (d) {
      case YDescription.inFrontOf:
        return "FR";
      case YDescription.behind:
        return "BE";
      case YDescription.on:
        return "On";
    }
  }

  static String _formatStepsString(
    double steps, [
    bool includeStepsString = false,
  ]) {
    if (steps == 0) return "";
    final rounded = (steps * 100).roundToDouble() / 100;
    return includeStepsString
        ? "$rounded ${rounded == 1 ? 'step' : 'steps'} "
        : "$rounded ";
  }
}

class _ParsedValues {
  final Checkpoint xCheckpoint;
  final Checkpoint yCheckpoint;
  final String sideDescription;
  final XDescription xDescription;
  final YDescription yDescription;
  final double xSteps;
  final double ySteps;

  _ParsedValues({
    required this.xCheckpoint,
    required this.yCheckpoint,
    required this.sideDescription,
    required this.xDescription,
    required this.yDescription,
    required this.xSteps,
    required this.ySteps,
  });
}
