import 'field_theme.dart';

enum MeasurementSystem { imperial, metric }

class SideDescriptions {
  final String verboseLeft;
  final String verboseRight;
  final String terseLeft;
  final String terseRight;

  const SideDescriptions({
    required this.verboseLeft,
    required this.verboseRight,
    required this.terseLeft,
    required this.terseRight,
  });

  static const defaultDescriptions = SideDescriptions(
    verboseLeft: "Side 1",
    verboseRight: "Side 2",
    terseLeft: "S1",
    terseRight: "S2",
  );
}

class YardNumberCoordinates {
  final double? homeStepsFromFrontToOutside;
  final double? homeStepsFromFrontToInside;
  final double? awayStepsFromFrontToInside;
  final double? awayStepsFromFrontToOutside;

  const YardNumberCoordinates({
    this.homeStepsFromFrontToOutside,
    this.homeStepsFromFrontToInside,
    this.awayStepsFromFrontToInside,
    this.awayStepsFromFrontToOutside,
  });
}

class Checkpoint {
  final int id;
  final String name;
  final String axis;
  final String terseName;
  final double stepsFromCenterFront;
  final bool useAsReference;
  final String? fieldLabel;
  final bool visible;

  const Checkpoint({
    required this.id,
    required this.name,
    required this.axis,
    required this.terseName,
    required this.stepsFromCenterFront,
    required this.useAsReference,
    this.fieldLabel,
    this.visible = true,
  });
}

class PixelPoint {
  final double xPixels;
  final double yPixels;

  const PixelPoint({required this.xPixels, required this.yPixels});
}

class FieldProperties {
  static const double gridStrokeWidth = 1;
  static const double pixelsPerInch = 0.5;
  static const double defaultStepSizeInches = 22.5;

  final String name;
  final List<Checkpoint> xCheckpoints;
  final List<Checkpoint> yCheckpoints;
  final YardNumberCoordinates yardNumberCoordinates;
  final SideDescriptions sideDescriptions;
  final double halfLineXInterval;
  final double halfLineYInterval;
  final double stepSizeInches;
  final MeasurementSystem measurementSystem;
  final bool topLabelsVisible;
  final bool bottomLabelsVisible;
  final bool leftLabelsVisible;
  final bool rightLabelsVisible;
  final bool useHashes;
  final bool isCustom;
  final bool showFieldImage;
  final String imageFillOrFit;
  final FieldTheme theme;

  final double width;
  final double height;
  final PixelPoint centerFrontPoint;

  FieldProperties({
    required this.name,
    required this.xCheckpoints,
    required this.yCheckpoints,
    this.yardNumberCoordinates = const YardNumberCoordinates(),
    this.sideDescriptions = SideDescriptions.defaultDescriptions,
    this.halfLineXInterval = 0,
    this.halfLineYInterval = 0,
    this.stepSizeInches = defaultStepSizeInches,
    this.measurementSystem = MeasurementSystem.imperial,
    this.topLabelsVisible = true,
    this.bottomLabelsVisible = true,
    this.leftLabelsVisible = true,
    this.rightLabelsVisible = true,
    this.useHashes = false,
    this.isCustom = true,
    this.showFieldImage = true,
    this.imageFillOrFit = "fit",
    this.theme = defaultFieldTheme,
  }) : width = _calculateWidth(xCheckpoints, stepSizeInches),
       height = _calculateHeight(yCheckpoints, stepSizeInches),
       centerFrontPoint = PixelPoint(
         xPixels: _calculateWidth(xCheckpoints, stepSizeInches) / 2,
         yPixels: _calculateHeight(yCheckpoints, stepSizeInches),
       );

  static double _calculateWidth(List<Checkpoint> checkpoints, double stepSize) {
    final steps = checkpoints.map((c) => c.stepsFromCenterFront);
    final min = steps.reduce((a, b) => a < b ? a : b);
    final max = steps.reduce((a, b) => a > b ? a : b);
    return (max - min) * stepSize * pixelsPerInch;
  }

  static double _calculateHeight(
    List<Checkpoint> checkpoints,
    double stepSize,
  ) {
    final steps = checkpoints.map((c) => c.stepsFromCenterFront);
    final min = steps.reduce((a, b) => a < b ? a : b);
    final max = steps.reduce((a, b) => a > b ? a : b);
    return (max - min) * stepSize * pixelsPerInch;
  }

  double get pixelsPerStep => stepSizeInches * pixelsPerInch;

  double get stepSizeInUnits => measurementSystem == MeasurementSystem.imperial
      ? stepSizeInches
      : stepSizeInches * 2.54;

  static double centimetersToInches(double cm) => cm / 2.54;

  double get totalWidthInches => width / pixelsPerInch;

  double get totalHeightInches => height / pixelsPerInch;

  String get prettyWidth {
    final inches = totalWidthInches;
    return measurementSystem == MeasurementSystem.metric
        ? "${(inches * 0.0254).toStringAsFixed(2)} m"
        : "${(inches / 12).toStringAsFixed(2)} ft";
  }

  String get prettyHeight {
    final inches = totalHeightInches;
    return measurementSystem == MeasurementSystem.metric
        ? "${(inches * 0.0254).toStringAsFixed(2)} m"
        : "${(inches / 12).toStringAsFixed(2)} ft";
  }
}
