class Api::V1::PagesController < ApplicationController
  def index
    @pages = Page.all
    render json: @pages
  end

  def show
    @page = Page.find(params[:id])
    render json: @page
  end

  def create
    @page = Page.new(page_params)
    if @page.save
      render json: @page
    else
      # render error: @page.errors, status: :unprocessable_entity
      render json: { errors: @page.errors }, status: :unprocessable_entity
    end
  end

  def page_params
    params.require(:page).permit(:name, :counts)
  end
end
