class MarcherPage {
  final int id;
  final int marcherId;
  final int pageId;
  final double x;
  final double y;
  final String? notes;

  const MarcherPage({
    required this.id,
    required this.marcherId,
    required this.pageId,
    required this.x,
    required this.y,
    this.notes,
  });

  factory MarcherPage.fromJson(Map<String, dynamic> json) {
    return MarcherPage(
      id: json['id'],
      marcherId: json['marcher_id'],
      pageId: json['page_id'],
      x: (json['x'] as num).toDouble(),
      y: (json['y'] as num).toDouble(),
      notes: json['notes'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'marcher_id': marcherId,
      'page_id': pageId,
      'x': x,
      'y': y,
      if (notes != null) 'notes': notes,
    };
  }

  MarcherPage copyWith({
    int? id,
    int? marcherId,
    int? pageId,
    double? x,
    double? y,
    String? notes,
  }) {
    return MarcherPage(
      id: id ?? this.id,
      marcherId: marcherId ?? this.marcherId,
      pageId: pageId ?? this.pageId,
      x: x ?? this.x,
      y: y ?? this.y,
      notes: notes ?? this.notes,
    );
  }

  static List<MarcherPage> filterByPageId(
    List<MarcherPage> pages,
    int? pageId,
  ) {
    if (pageId == null) return [];
    return pages.where((p) => p.pageId == pageId).toList();
  }

  static List<MarcherPage> filterByMarcherId(
    List<MarcherPage> pages,
    int marcherId,
  ) {
    return pages.where((p) => p.marcherId == marcherId).toList();
  }
}

class ModifiedMarcherPageArgs {
  final int marcherId;
  final int pageId;
  final double x;
  final double y;
  final String? notes;

  const ModifiedMarcherPageArgs({
    required this.marcherId,
    required this.pageId,
    required this.x,
    required this.y,
    this.notes,
  });

  Map<String, dynamic> toJson() {
    return {
      'marcher_id': marcherId,
      'page_id': pageId,
      'x': x,
      'y': y,
      if (notes != null) 'notes': notes,
    };
  }
}
