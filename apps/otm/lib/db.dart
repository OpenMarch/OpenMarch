import 'dart:async';
import 'dart:io';
import 'package:flutter/widgets.dart';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import 'package:flutter/services.dart';

Future<void> copyDatabaseFromAssets() async {
  // Get the path to the database directory
  final databasesPath = await getDatabasesPath();
  final path = join(databasesPath, 'dots.db');

  // Only copy if the file doesn't already exist
  final exists = await File(path).exists();
  if (!exists) {
    // Load from assets
    final data = await rootBundle.load('assets/dots.db');
    final bytes = data.buffer.asUint8List(
      data.offsetInBytes,
      data.lengthInBytes,
    );

    // Write to device
    await File(path).writeAsBytes(bytes, flush: true);
  }
}

class DatabaseHelper {
  static final _dbName = "test.dots";

  static Future<Database> openDatabaseFromAsset() async {
    // Get path to the document directory
    final databasesPath = await getDatabasesPath();
    final path = join(databasesPath, 'local_file.dots');

    // Copy from asset if DB doesn't exist
    if (!await File(path).exists()) {
      ByteData data = await rootBundle.load("assets/$_dbName");
      List<int> bytes = data.buffer.asUint8List(
        data.offsetInBytes,
        data.lengthInBytes,
      );
      await File(path).writeAsBytes(bytes);
    }

    return await openDatabase(path);
  }
}

Future<List<Map<String, dynamic>>> fetchData() async {
  final db = await DatabaseHelper.openDatabaseFromAsset();
  return await db.query('marchers');
}

void initDb() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Open the database and store the reference.
  final database = await openDatabase(
    // Set the path to the database. Note: Using the `join` function from the
    // `path` package is best practice to ensure the path is correctly
    // constructed for each platform.
    join(await getDatabasesPath(), 'local_file.dots'),
  );
}
