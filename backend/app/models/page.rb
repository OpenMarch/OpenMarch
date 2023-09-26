class Page < ApplicationRecord
  belongs_to :previous_page , class_name: 'Page', optional: true
  belongs_to :next_page, class_name: 'Page', optional: true
  has_many :marcher_pages
  has_many :marchers, through: :marcher_pages

  validates :name, :counts, presence: true
  validates :name, uniqueness: true

  # when a new page is created, add a new MarcherPage for each marcher
  # and set the prefix of the id to page_
  before_create :set_order
  after_create :create_marcher_pages, :prefix_id

  private
    def create_marcher_pages
      Marcher.all.each do |marcher|
        # TODO make this actually put the values of the previous page in the new page
        # Set x and y values based on the previous MarcherPage or default values
        x_prev = 25
        y_prev = 25

        MarcherPage.create(marcher: marcher, page: self, x: x_prev, y: y_prev)
      end
    end

    def set_order
      # Find the highest order value among existing pages
      highest_order = Page.maximum(:order)

      # Set the order of the new page to be one higher than the highest order
      self.order = highest_order.to_i + 1
    end

    # Create a custom id to avoid conflicts between other tables
    def prefix_id
      update(id_for_html: "page_#{self.id}")
    end

end
