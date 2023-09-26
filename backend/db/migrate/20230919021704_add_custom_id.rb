class AddCustomId < ActiveRecord::Migration[7.0]
  def change
    add_column :marchers, :id_for_html, :string
    add_column :pages, :id_for_html, :string
    add_column :marcher_pages, :id_for_html, :string
  end
end
