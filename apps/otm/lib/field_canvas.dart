import 'package:flutter/material.dart';
import 'package:otm/field_grid_painter.dart';
import 'package:otm/models/from_desktop/field_properties.dart';

class FieldCanvas extends StatefulWidget {
  const FieldCanvas({super.key});

  @override
  State<FieldCanvas> createState() => _FieldCanvasState();
}

class _FieldCanvasState extends State<FieldCanvas> with WidgetsBindingObserver {
  static const double _canvasOverflow = 200.0;

  final TransformationController _transformationController =
      TransformationController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeMetrics() {
    // This is called when the app is resized, e.g. orientation change.
    _fitFieldToView();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // This is called when the widget is first built and when dependencies change.
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitFieldToView());
  }

  void _fitFieldToView() {
    final renderBox = context.findRenderObject() as RenderBox?;
    if (renderBox == null || !renderBox.hasSize) {
      return;
    }

    final viewSize = renderBox.size;
    final fieldSize = Size(
      defaultFieldProperties.width,
      defaultFieldProperties.height,
    );

    final scaleX = viewSize.width / fieldSize.width;
    final scaleY = viewSize.height / fieldSize.height;
    final scale = scaleX < scaleY ? scaleX : scaleY;

    final scaledFieldWidth = fieldSize.width * scale;
    final scaledFieldHeight = fieldSize.height * scale;

    final dx = (viewSize.width - scaledFieldWidth) / 2;
    final dy = (viewSize.height - scaledFieldHeight) / 2;

    _transformationController.value = Matrix4.identity()
      ..translate(dx, dy)
      ..scale(scale);
  }

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      constrained: false,
      boundaryMargin: const EdgeInsets.all(_canvasOverflow),
      transformationController: _transformationController,
      minScale: 0.1,
      maxScale: 4.0,
      child: CustomPaint(
        painter: FieldGridPainter(fieldProperties: defaultFieldProperties),
        size: Size(defaultFieldProperties.width, defaultFieldProperties.height),
      ),
    );
  }
}
