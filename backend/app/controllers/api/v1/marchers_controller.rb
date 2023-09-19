class Api::V1::MarchersController < ApplicationController
  def index
    @marchers = Marcher.all
    render json: @marchers
  end

  def show
    @marcher = Marcher.find(params[:id])
    render json: @marcher
  end

  def create
    @marcher = Marcher.new(marcher_params)
    if @marcher.save
      render json: @marcher
    else
      render error: @marcher.errors, status: :unprocessable_entity
    end
  end

  def marcher_params
    params.require(:marcher).permit(:name, :instrument, :drill_number, :drill_prefix)
  end
end
