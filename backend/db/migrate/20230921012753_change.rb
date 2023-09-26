class Change < ActiveRecord::Migration[7.0]
  def change
    execute <<-SQL
      UPDATE marcher_pages
      SET custom_id = 'mp_' || id
    SQL
  end
end
