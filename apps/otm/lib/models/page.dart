class Page {
  final int id;
  final String name;
  final int counts;
  final String notes;
  final int order;
  final bool isSubset;
  final int duration;

  Page({
    required this.id,
    required this.name,
    required this.counts,
    required this.notes,
    required this.order,
    required this.isSubset,
    required this.duration,
  });
}
