class Marcher
  attr_reader :prevCoord, :nextCoord, :distance, :currCoord
  attr_accessor :number, :name, :role, :coords, :currSet, :setCounts

  def initialize(number, name, role)
    @number = number
    @name = name
    @role = role
    @coords = []
    @currSet = 0
  end

  def setCoords(coords, setCounts)
    @coords = coords
    @setCounts = setCounts
    moveToSet(@currSet)
  end

  def moveToSet(setNumber)
    if setNumber >= 0 && setNumber < @coords.length
      @currSet = setNumber
      @prevCoord = self.prevCoord
      @currCoord = self.setCurrCoord
      @nextCoord = self.nextCoord
      @distance = self.calcDistance
      @stepSize = self.calcStepSize(@distance, @setCounts[setNumber]) unless distance == nil
    end
    yield self if block_given?
  end

  def describe
    puts "Current coordinates: #{@currCoord} | Distance: #{@distance / 12} feet
    \tStep Size: #{@stepSize} to 5 in #{@setCounts[@currSet]} steps"
  end

  private
    def setCurrCoord
      @coords[@currSet] unless @currSet >= @coords.length
    end

    def nextCoord
      @coords[@currSet + 1] unless @currSet >= @coords.length + 1
    end

    def prevCoord
      @coords[@currSet - 1] unless @currSet <= 0
    end

    def calcDistance
      unless @prevCoord == nil
        s1, s2 = (@prevCoord[:x] - @currCoord[:x]).abs, (@prevCoord[:y] - @currCoord[:y]).abs
        s3 = Math.sqrt(s1**2 + s2**2)
        (s3 * 22.5)
      end
    end

    def calcStepSize(distance, counts)
      180 / (distance / counts)
    end
end

setCounts = [8, 6, 8, 8]
firstMarcher = Marcher.new(:B1, "Alex", "Baritone")
coords = [{:x => 0, :y => 0}, {:x => 8, :y => 0}, {:x => 0, :y => 0}, {:x => 8, :y => 8}]
firstMarcher.setCoords(coords, setCounts)
puts firstMarcher.inspect
puts "Current coordinates: #{firstMarcher.currCoord}"
firstMarcher.moveToSet(1) {firstMarcher.describe}
firstMarcher.moveToSet(2) {firstMarcher.describe}
firstMarcher.moveToSet(3) {firstMarcher.describe}


