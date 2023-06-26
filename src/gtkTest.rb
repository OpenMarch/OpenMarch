require 'gtk3'

# Create a basic GTK application
app = Gtk::Application.new('org.example.myapp', :flags_none)

# Handle the 'activate' signal to create the main window
app.signal_connect('activate') do |application|
  window = Gtk::ApplicationWindow.new(application)
  window.set_title('My GTK App')
  window.set_default_size(300, 200)
  window.show_all
end

# Run the application
status = app.run

# Clean up resources
app.release

status
