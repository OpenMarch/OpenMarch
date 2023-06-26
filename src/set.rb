class Set
  attr_accessor :counts, :notes

  def initialize(counts, notes = "")
    @counts = counts
    @notes = ""
  end

  def to_s
    "#{@counts} counts, #{@notes}"
  end
end`

  sets = []

sets.push(Set.new(4,""))

puts sets[0].to_s`
