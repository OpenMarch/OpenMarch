import 'dart:ui';

class RgbaColor {
  final int r;
  final int g;
  final int b;
  final double a;

  const RgbaColor({
    required this.r,
    required this.g,
    required this.b,
    required this.a,
  });

  factory RgbaColor.fromJson(Map<String, dynamic> json) {
    return RgbaColor(
      r: json['r'] as int,
      g: json['g'] as int,
      b: json['b'] as int,
      a: (json['a'] as num).toDouble(),
    );
  }

  Color toFlutterColor() {
    return Color.fromRGBO(r, g, b, a);
  }

  String toCssString() => 'rgba($r, $g, $b, $a)';
}

class MarcherColor {
  final RgbaColor fill;
  final RgbaColor outline;
  final RgbaColor label;

  const MarcherColor({
    required this.fill,
    required this.outline,
    required this.label,
  });

  factory MarcherColor.fromJson(Map<String, dynamic> json) {
    return MarcherColor(
      fill: RgbaColor.fromJson(json['fill']),
      outline: RgbaColor.fromJson(json['outline']),
      label: RgbaColor.fromJson(json['label']),
    );
  }
}

class FieldTheme {
  final RgbaColor primaryStroke;
  final RgbaColor secondaryStroke;
  final RgbaColor tertiaryStroke;
  final RgbaColor background;
  final RgbaColor fieldLabel;
  final RgbaColor externalLabel;
  final RgbaColor previousPath;
  final RgbaColor nextPath;
  final RgbaColor shape;
  final RgbaColor tempPath;
  final MarcherColor defaultMarcher;

  const FieldTheme({
    required this.primaryStroke,
    required this.secondaryStroke,
    required this.tertiaryStroke,
    required this.background,
    required this.fieldLabel,
    required this.externalLabel,
    required this.previousPath,
    required this.nextPath,
    required this.shape,
    required this.tempPath,
    required this.defaultMarcher,
  });

  factory FieldTheme.fromJson(Map<String, dynamic> json) {
    return FieldTheme(
      primaryStroke: RgbaColor.fromJson(json['primaryStroke']),
      secondaryStroke: RgbaColor.fromJson(json['secondaryStroke']),
      tertiaryStroke: RgbaColor.fromJson(json['tertiaryStroke']),
      background: RgbaColor.fromJson(json['background']),
      fieldLabel: RgbaColor.fromJson(json['fieldLabel']),
      externalLabel: RgbaColor.fromJson(json['externalLabel']),
      previousPath: RgbaColor.fromJson(json['previousPath']),
      nextPath: RgbaColor.fromJson(json['nextPath']),
      shape: RgbaColor.fromJson(json['shape']),
      tempPath: RgbaColor.fromJson(json['tempPath']),
      defaultMarcher: MarcherColor.fromJson(json['defaultMarcher']),
    );
  }

  FieldTheme copyWith({
    RgbaColor? primaryStroke,
    RgbaColor? secondaryStroke,
    RgbaColor? tertiaryStroke,
    RgbaColor? background,
    RgbaColor? fieldLabel,
    RgbaColor? externalLabel,
    RgbaColor? previousPath,
    RgbaColor? nextPath,
    RgbaColor? shape,
    RgbaColor? tempPath,
    MarcherColor? defaultMarcher,
  }) {
    return FieldTheme(
      primaryStroke: primaryStroke ?? this.primaryStroke,
      secondaryStroke: secondaryStroke ?? this.secondaryStroke,
      tertiaryStroke: tertiaryStroke ?? this.tertiaryStroke,
      background: background ?? this.background,
      fieldLabel: fieldLabel ?? this.fieldLabel,
      externalLabel: externalLabel ?? this.externalLabel,
      previousPath: previousPath ?? this.previousPath,
      nextPath: nextPath ?? this.nextPath,
      shape: shape ?? this.shape,
      tempPath: tempPath ?? this.tempPath,
      defaultMarcher: defaultMarcher ?? this.defaultMarcher,
    );
  }
}

const defaultFieldTheme = FieldTheme(
  primaryStroke: RgbaColor(r: 0, g: 0, b: 0, a: 1),
  secondaryStroke: RgbaColor(r: 170, g: 170, b: 170, a: 1),
  tertiaryStroke: RgbaColor(r: 221, g: 221, b: 221, a: 1),
  background: RgbaColor(r: 255, g: 255, b: 255, a: 1),
  fieldLabel: RgbaColor(r: 136, g: 136, b: 136, a: 1),
  externalLabel: RgbaColor(r: 136, g: 136, b: 136, a: 1),
  previousPath: RgbaColor(r: 0, g: 0, b: 0, a: 1),
  nextPath: RgbaColor(r: 0, g: 175, b: 13, a: 1),
  shape: RgbaColor(r: 126, g: 34, b: 206, a: 1),
  tempPath: RgbaColor(r: 192, g: 132, b: 252, a: 1),
  defaultMarcher: MarcherColor(
    fill: RgbaColor(r: 255, g: 0, b: 0, a: 1),
    outline: RgbaColor(r: 0, g: 0, b: 0, a: 0),
    label: RgbaColor(r: 0, g: 0, b: 0, a: 1),
  ),
);
