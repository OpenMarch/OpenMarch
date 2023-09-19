class MarcherPage < ApplicationRecord
  belongs_to :marcher
  belongs_to :page

  # add the marcherPage_ prefix to the id
  after_create :prefix_id
  private
    # Create a custom id to avoid conflicts between other tables
    def prefix_id
      self.custom_id = "marcherPage_#{self.id}"
    end
end
