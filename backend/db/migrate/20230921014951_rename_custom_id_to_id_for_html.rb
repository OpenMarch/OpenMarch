class RenameCustomIdToid_for_html < ActiveRecord::Migration[7.0]
  def change
    rename_column :marchers, :custom_id, :id_for_html
    rename_column :pages, :custom_id, :id_for_html
    rename_column :marcher_pages, :custom_id, :id_for_html
  end
end
