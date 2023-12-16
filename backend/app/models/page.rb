class Page < ApplicationRecord
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
        # Find the previous MarcherPage for this marcher
        previous_marcher_page = MarcherPage.joins(:page)
        .where(marcher: marcher)
        .where('"pages"."order" < ?', self.order)
        .order('"pages"."order" DESC')
        .first

        # Use the x and y values from the previous MarcherPage, or default values if it doesn't exist
        x_prev = previous_marcher_page ? previous_marcher_page.x : 25
        y_prev = previous_marcher_page ? previous_marcher_page.y : 25

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
