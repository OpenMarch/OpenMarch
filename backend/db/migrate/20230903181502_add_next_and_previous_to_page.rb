class AddNextAndPreviousToPage < ActiveRecord::Migration[7.0]
  def change
    add_column :pages, :next_page_id, :integer
    add_column :pages, :previous_page_id, :integer
  end
end
