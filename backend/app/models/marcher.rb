class Marcher < ApplicationRecord
  has_many :marcher_pages
  has_many :pages, through: :marcher_pages

  validates :name, presence: true

  # when a new marcher is created, add a new MarcherPage for each page
  after_create :create_marcher_pages
  private
    def create_marcher_pages
      Page.all.each do |page|
        MarcherPage.create(marcher: self, page: page, x: 25, y: 25)
      end
  end
end
