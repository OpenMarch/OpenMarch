class History_undo {
  final int sequence;
  final int history_group;
  final String sql;

  History_undo({required this.sequence, required this.history_group, required this.sql});

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

  History_redo({required this.sequence, required this.history_group, required this.sql});

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

  History_stat({required this.id, required this.cur_undo_group, required this.cur_redo_group, required this.group_limit});

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

  Beat({required this.id, required this.duration, required this.position, required this.include_in_measure, required this.notes, required this.created_at, required this.updated_at});

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

  Measure({required this.id, required this.start_beat, required this.rehearsal_mark, required this.notes, required this.created_at, required this.updated_at});

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