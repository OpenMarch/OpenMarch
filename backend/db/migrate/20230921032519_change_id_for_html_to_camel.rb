class Changeid_for_htmlToCamel < ActiveRecord::Migration[7.0]
  def up
    rename_column :marchers, :id_for_html, :id_for_html
    rename_column :pages, :id_for_html, :id_for_html
    rename_column :marcher_pages, :id_for_html, :id_for_html
  end
  def down
    rename_column :marchers, :id_for_html, :id_for_html
    rename_column :pages, :id_for_html, :id_for_html
    rename_column :marcher_pages, :id_for_html, :id_for_html
  end
end
