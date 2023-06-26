require 'tk'

root = TkRoot.new { title "Moving Shape" }
canvas = TkCanvas.new(root, width: 1500, height: 1000)
canvas.pack

circles = []

# Create a circle shape
circle = TkcOval.new(canvas, 60, 60, 110, 110, fill: 'red')
# circle2 = TkcOval.new(canvas, 60, 60, 110, 110, fill: 'red')
# circles.push(circle1, circle2)

# Define the movement parameters
dx = 2  # horizontal movement distance
dy = 2  # vertical movement distance

# Define the movement function
move_shape = proc do
  # circles.each do |circle|
    # Move the circle by updating its coordinates
    canvas.move(circle, dx, dy)

    # Get the current coordinates of the circle
    x1, y1, x2, y2 = canvas.coords(circle)

    # Check if the circle reaches the canvas boundaries
    if x2 >= canvas.width || x1 <= 0
      dx = -dx  # reverse horizontal direction
    end

    if y2 >= canvas.height || y1 <= 0
      dy = -dy  # reverse vertical direction
    end

    # Schedule the next movement
    canvas.after(10, move_shape)
  # end
end

# Start the movement
move_shape.call

Tk.mainloop
