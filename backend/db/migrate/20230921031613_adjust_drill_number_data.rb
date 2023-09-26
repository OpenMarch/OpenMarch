class AdjustDrillNumberData < ActiveRecord::Migration[7.0]
  def change
    rename_column :marchers, :drill_number, :drill_order
    add_column :marchers, :drill_number, :string

    execute <<-SQL
    UPDATE marchers
    SET drill_number = drill_prefix || drill_order
    SQL
  end
end
