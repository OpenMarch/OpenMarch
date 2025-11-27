---
title: "Creating a feature to move marchers"
description: "How to create a new feature to move marchers around"
---

One of the most common features contributors may want to add is the ability to move marchers to a specific shape.

To make this super easy, we provide a function for updating the coordinates of selected marchers on the selected page, or any page.
This means, rather than needing to think about state management or database updates, all you need to worry about is the X and Y coordinates.

## Using the update function

This is an example use case for moving the selected marchers to the right by 10 pixels with a button -

```typescript
import { useUpdateSelectedMarchersOnSelectedPage } from "@/hooks/queries";
import { Button } from "@openmarch/ui";

export default function DummyButton() {
    // the function used to update the marchers
    const { mutate: updateSelectedMarchers } =
        useUpdateSelectedMarchersOnSelectedPage();

    // the actual calculation of the new coordinates
    const onClick = () => {
        updateSelectedMarchers((currentCoordinates) => {
            const newCoordinates = currentCoordinates.map((coordinate) => ({
                marcher_id: coordinate.marcher_id,
                x: coordinate.x + 10,
                y: coordinate.y,
            }));

            // these coordinates will be sent to the database and the UI state will be updated
            return newCoordinates;
        });
    };

    return <Button onClick={onClick}>Move to the right</Button>;
}
```

This mutation function expects a _transformation function_ as an argument.
Put simply - _Given the current coordinates of marchers, modify those coordinates and return the result._

## Examples

### Move to the right

This function, as you saw above, moves the marchers to the right by 10 pixels -

```typescript
updateSelectedMarchers((currentCoordinates) => {
  return currentCoordinates.map((coordinate) => ({
    marcher_id: coordinate.marcher_id,
    x: coordinate.x + 10,
    y: coordinate.y,
  }));
});
```

![Animation showing selected marchers moving 10 pixels to the right when the button is clicked](/docs/developers/adding-a-feature/move-right-example.gif)

### Space out evenly

This function spaces the marchers out vertically by 12.5 pixels -

```typescript
updateSelectedMarchers((currentCoordinates) => {
  const topY = 100;
  return currentCoordinates.map((coordinate, index) => ({
    marcher_id: coordinate.marcher_id,
    x: coordinate.x,
    y: topY + index * 12.5,
  }));
});
```

![Animation showing marchers being spaced out evenly but without proper sorting, resulting in a jumbled arrangement](/docs/developers/adding-a-feature/even-spacing-bad.gif)

Hmm, this doesn't look too great. Plus, if we try to animate from the previous position, we see the marchers fold in on themselves -

![Animation showing marchers folding in on themselves during transition due to improper sorting](/docs/developers/adding-a-feature/even-spacing-animation-bad.gif)

Not very usable at all...

### Improving the even spacing

To make this better, we want to _sort_ the coordinates that we are setting based on the marcher's current position -

```typescript
updateSelectedMarchers((currentCoordinates) => {
  const topY = 100;

  const sortedCoordinates = currentCoordinates.sort((a, b) => {
    // If the Y coordinates are the same, sort by X coordinate.
    if (a.y === b.y) return a.x - b.x;
    // Otherwise, sort by Y coordinate.
    return a.y - b.y;
  });

  return sortedCoordinates.map((coordinate, i) => ({
    marcher_id: coordinate.marcher_id,
    x: coordinate.x,
    y: topY + i * 12.5,
  }));
});
```

![Animation showing marchers being properly spaced out vertically with correct sorting](/docs/developers/adding-a-feature/even-spacing-good.gif)

and the animation...

![Animation showing smooth transition of marchers moving into evenly spaced positions with proper sorting](/docs/developers/adding-a-feature/even-spacing-animation-good.gif)

**Much** better

### Combine into a line

Lastly -

- Let's say we want our marchers to end up in a straight line vertically
- Let's also say we want them at a 2-step interval (matching the user-defined step-size), rather than just a set number of pixels
- Let's also also say that we want the top Y-coordinate of the line to be the Y-coordinate of the top-most marcher

This is also very simple to do -

```typescript
import {
    fieldPropertiesQueryOptions, // added this as an import
    useUpdateSelectedMarchersOnSelectedPage,
} from "@/hooks/queries";
import { conToastError } from "@/utilities/utils";  // Prints a toast error that the user sees, and a console error
import { Button } from "@openmarch/ui";
import { useQuery } from "@tanstack/react-query";

export default function DummyButton() {
    const { mutate: updateSelectedMarchers } =
        useUpdateSelectedMarchersOnSelectedPage();
    // Load the field properties so we know how many pixels a "step" is
    const { data: fieldProperties, isSuccess: isFieldPropertiesLoading } =
        useQuery(fieldPropertiesQueryOptions());

    const onClick = () => {
        // the field properties load on app startup, but it's good to double check that they are indeed loaded
        if (!isFieldPropertiesLoading) {
            conToastError("Field properties not loaded");
            return;
        }
        updateSelectedMarchers((currentCoordinates) => {
            // 2 step interval
            const spacing = fieldProperties.pixelsPerStep * 2;

            // Find the lowest Y coordinate
            const topY = Math.min(
                ...currentCoordinates.map((coordinate) => coordinate.y),
            );
            // Average the X coordinates of the selected marchers
            const averageXCoordinate =
                currentCoordinates.reduce(
                    (sum, coordinate) => sum + coordinate.x,
                    0,
                ) / currentCoordinates.length;

            const sortedCoordinates = currentCoordinates.sort((a, b) => {
                if (a.y === b.y) return a.x - b.x;
                return a.y - b.y;
            });

            return sortedCoordinates.map((coordinate, i) => ({
                ...coordinate,
                x: averageXCoordinate,
                y: topY + i * spacing,
            }));
        });
    };

    return <Button onClick={onClick}>Space out</Button>;
}
```

Here's what that looks like -

![Animation showing marchers being combined into a vertical line with 2-step spacing](/docs/developers/adding-a-feature/combine-into-line.gif)

And the animation is also pretty nice -

![Animation showing smooth transition of marchers moving into a vertical line formation](/docs/developers/adding-a-feature/combine-into-line-animation.gif)

We can also see that the marchers end up at a 2-step interval! Granted, they aren't rounded to the nearest step, but they are 2-steps apart for sure -

![Screenshot showing marchers arranged in a vertical line with 2-step intervals between them](/docs/developers/adding-a-feature/interval.png)

Fun fact, a simpler version of this is how our "Align Horizontally" and "Align Vertically" buttons function.

## Your turn

With this, it should be _much_ easier to add your own forms to OpenMarch. Put letters, your school logo, or even some crazy 3D cube! We're still in the process of figuring out where all of these buttons should go, but don't let that stop you. Reach out on [Discord](discord.openmarch.com) if you need any help or have any questions.
