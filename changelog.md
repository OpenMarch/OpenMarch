# 0.0.7 - Field Customization

## Field and Grid Customization

Now, a user can make their own field with whatever measurements and specifications they want (as long as it's a rectangle).

Check out the [grid customization guide](https://openmarch.com/guides/editing-the-grid/) on the website for all of the ways you can modify the field.

## Fixes

- Fixed a bug where the min and max step size were not calculated correctly

## Dev

- Delete old table creation functions in the `Table` files
  - These tables have been created in the `Migration` files since `0.0.5`
  - Fixed the test that broke due to this
