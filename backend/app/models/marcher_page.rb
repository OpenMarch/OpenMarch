class MarcherPage < ApplicationRecord
  belongs_to :marcher
  belongs_to :page

  # add the marcherPage_ prefix to the id
  after_create :prefix_id

  before_save :round_coordinates
  private
    # Create a custom id to avoid conflicts between other tables
    def prefix_id
      update(id_for_html: "marcherPage_#{self.id}")
    end

    def round_coordinates
      self.x = self.x.round(1)
      self.y = self.y.round(1)
    end
end
