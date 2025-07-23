import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:otm/field_canvas.dart';

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
          title: const Text(
            'On the Move',
            style: TextStyle(color: Color.fromARGB(255, 255, 255, 255)),
          ),
        ),
        body: Stack(
          children: [
            const FieldCanvas(),
            // Center(child: DataViewer()),
          ],
        ),
        // body: Center(child: DataViewer()),
      ),
    );
  }
}
