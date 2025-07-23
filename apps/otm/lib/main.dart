import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:otm/field_grid_painter.dart';
import 'package:otm/models/from_desktop/field_properties.dart';

void main() {
  runApp(ProviderScope(child: MyApp()));
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(
          backgroundColor: const Color(0xFF6432FF),
          title: const Text('On the Move'),
        ),
        body: Stack(
          children: [
            CustomPaint(
              painter: FieldGridPainter(
                fieldProperties: defaultFieldProperties,
              ),
              size: Size.infinite,
            ),
            // Center(child: DataViewer()),
          ],
        ),
        // body: Center(child: DataViewer()),
      ),
    );
  }
}
