class Marcher < ApplicationRecord
  has_many :marcher_pages
  has_many :pages, through: :marcher_pages

  validates :name, :drill_prefix, :drill_order, presence: true

  # before_create :prefix_id

  # when a new marcher is created, add a new MarcherPage for each page
  after_create :set_drill_number, :prefix_id, :create_marcher_pages
  private
    def create_marcher_pages
      Page.all.each do |page|
        MarcherPage.create(marcher: self, page: page, x: 25, y: 25)
      end
    end

    # Create a custom id to avoid conflicts between other tables
    def prefix_id
      update(id_for_html: "marcher_#{self.id}")
    end

    def set_drill_number
      update(drill_number: self.drill_prefix + self.drill_order.to_s)
    end

    def unique_drill_number
      # Check for uniqueness of the combination of prefix and number
      if Marcher.where(drill_prefix: self.drill_prefix, drill_order: self.drill_order).exists?
        # TODO maybe add a more descipt console message?
        errors.add(:base, "Drill identifier must be unique")
      end
    end
end
