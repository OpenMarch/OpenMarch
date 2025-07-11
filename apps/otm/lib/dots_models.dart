class History_undo {
  final int sequence;
  final int history_group;
  final String sql;

  History_undo({
    required this.sequence,
    required this.history_group,
    required this.sql,
  });

  factory History_undo.fromMap(Map<String, dynamic> map) {
    return History_undo(
      sequence: map['sequence'] as int,
      history_group: map['history_group'] as int,
      sql: map['sql'] as String,
    );
  }
}

class History_redo {
  final int sequence;
  final int history_group;
  final String sql;

  History_redo({
    required this.sequence,
    required this.history_group,
    required this.sql,
  });

  factory History_redo.fromMap(Map<String, dynamic> map) {
    return History_redo(
      sequence: map['sequence'] as int,
      history_group: map['history_group'] as int,
      sql: map['sql'] as String,
    );
  }
}

class History_stat {
  final int id;
  final int cur_undo_group;
  final int cur_redo_group;
  final int group_limit;

  History_stat({
    required this.id,
    required this.cur_undo_group,
    required this.cur_redo_group,
    required this.group_limit,
  });

  factory History_stat.fromMap(Map<String, dynamic> map) {
    return History_stat(
      id: map['id'] as int,
      cur_undo_group: map['cur_undo_group'] as int,
      cur_redo_group: map['cur_redo_group'] as int,
      group_limit: map['group_limit'] as int,
    );
  }
}

class Beat {
  final int id;
  final double duration;
  final int position;
  final int include_in_measure;
  final String notes;
  final String created_at;
  final String updated_at;

  Beat({
    required this.id,
    required this.duration,
    required this.position,
    required this.include_in_measure,
    required this.notes,
    required this.created_at,
    required this.updated_at,
  });

  factory Beat.fromMap(Map<String, dynamic> map) {
    return Beat(
      id: map['id'] as int,
      duration: (map['duration'] as num).toDouble(),
      position: map['position'] as int,
      include_in_measure: map['include_in_measure'] as int,
      notes: map['notes'] as String,
      created_at: map['created_at'] as String,
      updated_at: map['updated_at'] as String,
    );
  }
}

class Measure {
  final int id;
  final int start_beat;
  final String rehearsal_mark;
  final String notes;
  final String created_at;
  final String updated_at;

  Measure({
    required this.id,
    required this.start_beat,
    required this.rehearsal_mark,
    required this.notes,
    required this.created_at,
    required this.updated_at,
  });

  factory Measure.fromMap(Map<String, dynamic> map) {
    return Measure(
      id: map['id'] as int,
      start_beat: map['start_beat'] as int,
      rehearsal_mark: map['rehearsal_mark'] as String,
      notes: map['notes'] as String,
      created_at: map['created_at'] as String,
      updated_at: map['updated_at'] as String,
    );
  }
}

class Page {
  final int id;
  final int is_subset;
  final String? notes;
  final String created_at;
  final String updated_at;
  final int start_beat;

  Page({
    required this.id,
    required this.is_subset,
    this.notes,
    required this.created_at,
    required this.updated_at,
    required this.start_beat,
  });

  factory Page.fromMap(Map<String, dynamic> map) {
    return Page(
      id: map['id'] as int,
      is_subset: map['is_subset'] as int,
      notes: map['notes'] as String?,
      created_at: map['created_at'] as String,
      updated_at: map['updated_at'] as String,
      start_beat: map['start_beat'] as int,
    );
  }
}

class Marcher {
  final int id;
  final String? name;
  final String section;
  final String? year;
  final String? notes;
  final String drill_prefix;
  final int drill_order;
  final String created_at;
  final String updated_at;

  Marcher({
    required this.id,
    this.name,
    required this.section,
    this.year,
    this.notes,
    required this.drill_prefix,
    required this.drill_order,
    required this.created_at,
    required this.updated_at,
  });

  factory Marcher.fromMap(Map<String, dynamic> map) {
    return Marcher(
      id: map['id'] as int,
      name: map['name'] as String?,
      section: map['section'] as String,
      year: map['year'] as String?,
      notes: map['notes'] as String?,
      drill_prefix: map['drill_prefix'] as String,
      drill_order: map['drill_order'] as int,
      created_at: map['created_at'] as String,
      updated_at: map['updated_at'] as String,
    );
  }
}

class MarcherPage {
  final int id;
  final String? id_for_html;
  final int marcher_id;
  final int page_id;
  final double? x;
  final double? y;
  final String created_at;
  final String updated_at;
  final String? notes;

  MarcherPage({
    required this.id,
    this.id_for_html,
    required this.marcher_id,
    required this.page_id,
    this.x,
    this.y,
    required this.created_at,
    required this.updated_at,
    this.notes,
  });

  factory MarcherPage.fromMap(Map<String, dynamic> map) {
    return MarcherPage(
      id: map['id'] as int,
      id_for_html: map['id_for_html'] as String?,
      marcher_id: map['marcher_id'] as int,
      page_id: map['page_id'] as int,
      x: (map['x'] as num?)?.toDouble(),
      y: (map['y'] as num?)?.toDouble(),
      created_at: map['created_at'] as String,
      updated_at: map['updated_at'] as String,
      notes: map['notes'] as String?,
    );
  }
}

class FieldProperties {
  final int id;
  final String json_data;
  final List<int>? image;

  FieldProperties({required this.id, required this.json_data, this.image});

  factory FieldProperties.fromMap(Map<String, dynamic> map) {
    return FieldProperties(
      id: map['id'] as int,
      json_data: map['json_data'] as String,
      image: map['image'] as List<int>?,
    );
  }
}

class AudioFile {
  final int id;
  final String path;
  final String? nickname;
  final List<int>? data;
  final int selected;
  final String created_at;
  final String updated_at;

  AudioFile({
    required this.id,
    required this.path,
    this.nickname,
    this.data,
    required this.selected,
    required this.created_at,
    required this.updated_at,
  });

  factory AudioFile.fromMap(Map<String, dynamic> map) {
    return AudioFile(
      id: map['id'] as int,
      path: map['path'] as String,
      nickname: map['nickname'] as String?,
      data: map['data'] as List<int>?,
      selected: map['selected'] as int,
      created_at: map['created_at'] as String,
      updated_at: map['updated_at'] as String,
    );
  }
}

class Shape {
  final int id;
  final String? name;
  final String created_at;
  final String updated_at;
  final String? notes;

  Shape({
    required this.id,
    this.name,
    required this.created_at,
    required this.updated_at,
    this.notes,
  });

  factory Shape.fromMap(Map<String, dynamic> map) {
    return Shape(
      id: map['id'] as int,
      name: map['name'] as String?,
      created_at: map['created_at'] as String,
      updated_at: map['updated_at'] as String,
      notes: map['notes'] as String?,
    );
  }
}

class ShapePage {
  final int id;
  final int shape_id;
  final int page_id;
  final String svg_path;
  final String created_at;
  final String updated_at;
  final String? notes;

  ShapePage({
    required this.id,
    required this.shape_id,
    required this.page_id,
    required this.svg_path,
    required this.created_at,
    required this.updated_at,
    this.notes,
  });

  factory ShapePage.fromMap(Map<String, dynamic> map) {
    return ShapePage(
      id: map['id'] as int,
      shape_id: map['shape_id'] as int,
      page_id: map['page_id'] as int,
      svg_path: map['svg_path'] as String,
      created_at: map['created_at'] as String,
      updated_at: map['updated_at'] as String,
      notes: map['notes'] as String?,
    );
  }
}

class ShapePageMarcher {
  final int id;
  final int shape_page_id;
  final int marcher_id;
  final int? position_order;
  final String created_at;
  final String updated_at;
  final String? notes;

  ShapePageMarcher({
    required this.id,
    required this.shape_page_id,
    required this.marcher_id,
    this.position_order,
    required this.created_at,
    required this.updated_at,
    this.notes,
  });

  factory ShapePageMarcher.fromMap(Map<String, dynamic> map) {
    return ShapePageMarcher(
      id: map['id'] as int,
      shape_page_id: map['shape_page_id'] as int,
      marcher_id: map['marcher_id'] as int,
      position_order: map['position_order'] as int?,
      created_at: map['created_at'] as String,
      updated_at: map['updated_at'] as String,
      notes: map['notes'] as String?,
    );
  }
}

class SectionAppearance {
  final int id;
  final String section;
  final String fill_color;
  final String outline_color;
  final String shape_type;
  final String created_at;
  final String updated_at;

  SectionAppearance({
    required this.id,
    required this.section,
    required this.fill_color,
    required this.outline_color,
    required this.shape_type,
    required this.created_at,
    required this.updated_at,
  });

  factory SectionAppearance.fromMap(Map<String, dynamic> map) {
    return SectionAppearance(
      id: map['id'] as int,
      section: map['section'] as String,
      fill_color: map['fill_color'] as String,
      outline_color: map['outline_color'] as String,
      shape_type: map['shape_type'] as String,
      created_at: map['created_at'] as String,
      updated_at: map['updated_at'] as String,
    );
  }
}

class Utility {
  final int id;
  final int? last_page_counts;

  Utility({required this.id, this.last_page_counts});

  factory Utility.fromMap(Map<String, dynamic> map) {
    return Utility(
      id: map['id'] as int,
      last_page_counts: map['last_page_counts'] as int?,
    );
  }
}
