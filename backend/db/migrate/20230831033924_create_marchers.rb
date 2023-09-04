class CreateMarchers < ActiveRecord::Migration[7.0]
  def change
    create_table :marchers do |t|
      t.text :name

      t.timestamps
    end
  end
end
