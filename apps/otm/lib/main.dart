import 'package:flutter/material.dart';
import 'db.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:otm/models/from_desktop/readable_coords.dart';

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
        body: Center(child: DataViewer()),
      ),
    );
  }
}

class DataViewer extends StatefulWidget {
  const DataViewer({super.key});

  @override
  State<DataViewer> createState() => _DataViewerState();
}

class _DataViewerState extends State<DataViewer> {
  Future<List<ReadableCoords>>? _data;

  @override
  void initState() {
    super.initState();
    _data = fetchData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("SQLite Data")),
      body: FutureBuilder<List<ReadableCoords>>(
        future: _data,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text("Error ${snapshot.error}"));
          }

          final rows = snapshot.data!;
          return ListView.builder(
            itemCount: rows.length,
            itemBuilder: (context, index) {
              final row = rows[index];
              return ListTile(title: Text(row.toString()));
            },
          );
        },
      ),
    );
  }
}
