class InitialCreateFromSchema < ActiveRecord::Migration[7.0]
  def change
    create_table "marcher_pages", force: :cascade do |t|
      t.integer "marcher_id", null: false
      t.integer "page_id", null: false
      t.float "x"
      t.float "y"
      t.datetime "created_at", null: false
      t.datetime "updated_at", null: false
      t.string "id_for_html"
      t.index ["marcher_id"], name: "index_marcher_pages_on_marcher_id"
      t.index ["page_id"], name: "index_marcher_pages_on_page_id"
      t.text "notes"
    end

    create_table "marchers", force: :cascade do |t|
      t.text "name"
      t.datetime "created_at", null: false
      t.datetime "updated_at", null: false
      t.string "instrument"
      t.integer "drill_order", null: false
      t.string "drill_prefix", null: false
      t.string "id_for_html"
      t.string "drill_number"
      t.text "notes"
    end

    create_table "pages", force: :cascade do |t|
      t.string "name", null: false
      t.datetime "created_at", null: false
      t.datetime "updated_at", null: false
      t.integer "order"
      t.integer "counts", null: false
      t.string "id_for_html"
      t.float "tempo"
      t.text "notes"
    end

    add_foreign_key "marcher_pages", "marchers"
    add_foreign_key "marcher_pages", "pages"
  end
end
