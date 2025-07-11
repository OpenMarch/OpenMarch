class Marcher {
  final int id;
  final String name;
  final String section;
  final String notes;
  final String year;
  final String drillPrefix;
  final int drillOrder;
  final String drillNumber;

  Marcher({
    required this.id,
    required this.name,
    required this.section,
    required this.notes,
    required this.year,
    required this.drillPrefix,
    required this.drillOrder,
  }) : drillNumber = "$drillPrefix$drillOrder";
}
