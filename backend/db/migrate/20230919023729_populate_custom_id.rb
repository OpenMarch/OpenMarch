class PopulateCustomId < ActiveRecord::Migration[7.0]
  def change
    # Marcher.where(custom_id: nil).find_each do |marcher|
    #   marcher.update(custom_id: "marcher_#{marcher.id}")
    # end
    # Page.where(custom_id: nil).find_each do |page|
    #   marcher.update(custom_id: "page_#{page.id}")
    # end
    # MarcherPage.where(custom_id: nil).find_each do |marcherPage|
    #   marcherPage.update(custom_id: "marcherPage_#{marcherPage.id}")
    # end
    execute <<-SQL
    UPDATE marchers
    SET custom_id = 'marcher_' || id
    SQL
    execute <<-SQL
      UPDATE pages
      SET custom_id = 'page_' || id
    SQL
    execute <<-SQL
      UPDATE marcher_pages
      SET custom_id = 'marcherPage_' || id
    SQL
  end
end
