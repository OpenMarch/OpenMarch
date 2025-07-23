import 'package:flutter/material.dart';
import 'db.dart';
import 'package:otm/models/from_desktop/readable_coords.dart';

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
