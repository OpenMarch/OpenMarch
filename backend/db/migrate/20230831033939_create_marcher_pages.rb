class CreateMarcherPages < ActiveRecord::Migration[7.0]
  def change
    create_table :marcher_pages do |t|
      t.belongs_to :marcher, null: false, foreign_key: true
      t.belongs_to :page, null: false, foreign_key: true
      t.integer :x
      t.integer :y

      t.timestamps
    end
  end
end
