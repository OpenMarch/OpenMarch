class Marcher < ApplicationRecord
  has_many :marcher_pages
  has_many :pages, through: :marcher_pages

  validates :name, :drill_prefix, :drill_number, presence: true
  validate :unique_drill_number

  # before_create :prefix_id

  # when a new marcher is created, add a new MarcherPage for each page
  after_create :create_marcher_pages, :prefix_id
  private
    def create_marcher_pages
      Page.all.each do |page|
        MarcherPage.create(marcher: self, page: page, x: 25, y: 25)
      end
    end

    # Create a custom id to avoid conflicts between other tables
    def prefix_id
      self.custom_id = "marcher_#{self.id}"
    end

    def unique_drill_number
      # Check for uniqueness of the combination of prefix and number
      if Marcher.where(drill_prefix: self.drill_prefix, drill_number: self.drill_number).exists?
        # TODO maybe add a more descipt console message?
        errors.add(:base, "Drill identifier must be unique")
      end
    end
end
