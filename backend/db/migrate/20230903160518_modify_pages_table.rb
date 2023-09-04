class ModifyPagesTable < ActiveRecord::Migration[7.0]
  def change
    rename_column :pages, :title, :name
    add_column :pages, :order, :integer
    add_column :pages, :counts, :integer
  end
end
