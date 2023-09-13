class AddInstrumentAndDrillNumberToSamples < ActiveRecord::Migration[7.0]
  def change
    add_column :marchers, :instrument, :string
    add_column :marchers, :drill_number, :integer
    add_column :marchers, :drill_prefix, :string
  end
end
