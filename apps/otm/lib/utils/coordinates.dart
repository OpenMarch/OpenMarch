import 'package:otm/models/marcher.dart';
import 'package:otm/models/page.dart';
import 'package:otm/models/from_desktop/field_properties.dart';
import 'package:otm/models/from_desktop/marcher_page.dart';
import 'package:otm/models/from_desktop/readable_coords.dart';

List<MarcherPage> getMarcherPagesForMarcher(
  List<MarcherPage> marcherPages,
  int marcherId,
) {
  return marcherPages.where((mp) => mp.marcherId == marcherId).toList();
}

List<ReadableCoords> getReadableCoordsForMarcherPage(
  List<MarcherPage> marcherPages,
) {
  return marcherPages
      .map((mp) => ReadableCoords.fromMarcherPage(mp, roundingDenominator: 4))
      .toList();
}
