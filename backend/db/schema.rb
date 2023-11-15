# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[7.0].define(version: 2023_11_15_035213) do
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
  end

  create_table "marchers", force: :cascade do |t|
    t.text "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "instrument"
    t.integer "drill_order"
    t.string "drill_prefix"
    t.string "id_for_html"
    t.string "drill_number"
  end

  create_table "pages", force: :cascade do |t|
    t.string "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "order"
    t.integer "counts"
    t.string "id_for_html"
  end

  add_foreign_key "marcher_pages", "marchers"
  add_foreign_key "marcher_pages", "pages"
end
