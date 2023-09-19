class AddCustomId < ActiveRecord::Migration[7.0]
  def change
    add_column :marchers, :custom_id, :string
    add_column :pages, :custom_id, :string
    add_column :marcher_pages, :custom_id, :string
  end
end
