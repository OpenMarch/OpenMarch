class Removelinkedpages < ActiveRecord::Migration[7.0]
  def change
    remove_column :pages, :next_page_id, :integer
    remove_column :pages, :previous_page_id, :integer
  end
end
