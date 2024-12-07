# 0.0.5 - Custom Shapes and Indoor

## Features

### Custom Shapes

- Shapes are now supported
  - Create a line, curve, or double curve shape
  - This shape can be edited and chained together

### Indoor

- Indoor fields are now supported in both 6 to 5 and 8 to 5 (ish) steps. In feet:
  - 40x60
  - 50x70
  - 50x80
  - 50x90

> A 6 to 5 step is 30 inches in all of these cases, but an 8 to 5 is a bit more complicated to keep the grid divisible by 4.
>
> Lengths of 40', 60', and 90' have an 8 to 5 step of 22.5". These are the conversions for the other lengths:
>
> - 50' 8 to 5 = 21.429"
> - 70' 8 to 5 = 23.333"
> - 80' 8 to 5 = 21.818"
>
> Let me know if this is a bad approach.
> I think it's fine because all the lengths are about within 1" of 22.5"

## Quality of life

## Dev
