class ChangeColumnTypeInMarcherPages < ActiveRecord::Migration[7.0]
  def up
    change_column :marcher_pages, :x, :float
    change_column :marcher_pages, :y, :float
  end

  def down
    change_column :marcher_pages, :x, :integer
    change_column :marcher_pages, :y, :integer
  end
end
