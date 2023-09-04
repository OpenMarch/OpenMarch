class Api::V1::MarcherPagesController < ApplicationController
  def index
    @marcher_pages = MarcherPage.all
    render json: @marcher_pages
  end

  def index_by_marcher_and_page
     # GET /api/v1/marchers/:marcher_id/pages/:page_id/marcher_pages
    @marcher = Marcher.find(params[:marcher_id])
    @page = Page.find(params[:page_id])
    @marcher_page = MarcherPage.where(marcher: @marcher, page: @page)

    render json: @marcher_page
  end

  def index_by_marcher
     # GET /api/v1/marchers/:marcher_id/marcher_pages
    @marcher = Marcher.find(params[:marcher_id])
    @marcher_pages = MarcherPage.where(marcher: @marcher)

    render json: @marcher_pages
  end

  def index_by_page
     # GET /api/v1/pages/:page_id/marcher_pages
    @page = Page.find(params[:page_id])
    @marcher_pages = MarcherPage.where(page: @page)

    render json: @marcher_pages
  end

  def update_marcher_page
    # PATCH /api/v1/marchers/:marcher_id/pages/:page_id/marcher_pages
   @marcher = Marcher.find(params[:marcher_id])
   @page = Page.find(params[:page_id])
   @marcher_page = MarcherPage.where(marcher: @marcher, page: @page)

   if @marcher_page.update(marcher_page_params)
     render json: @marcher_page
   else
     render json: @marcher_page.errors, status: :unprocessable_entity
   end

  end

  # def show
  #   @marcher_page = MarcherPage.find(params[:id])
  #   render json: @marcher_page
  # end

  # def create
  #   @marcher_page = MarcherPage.new(marcher_page_params)

  #   if @marcher_page.save
  #     render json: @marcher_page
  #   else
  #     render json: @marcher_page.errors, status: :unprocessable_entity
  #   end
  # end

  # def update
  #   @marcher_page = MarcherPage.find(params[:id])

  #   if @marcher_page.update(marcher_page_params)
  #     render json: @marcher_page
  #   else
  #     render json: @marcher_page.errors, status: :unprocessable_entity
  #   end
  # end

  # def destroy
  #   @marcher_page = MarcherPage.find(params[:id])
  #   @marcher_page.destroy
  # end

  private

  def marcher_page_params
    params.require(:marcher_page).permit(:marcher_id, :page_id, :x, :y)
  end
end
