# Model import fixtures

<!-- cspell:words Khronos Wayfair Mackey -->

Real-world glTF files from the Khronos
[glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) repository, at commit
`8f492390ddc7a2ae221a1369ef560589cf8c70fb`, unchanged:

| File                        | Source                                     | License                                                                                                    |
| --------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `SheenChair.glb`            | `Models/SheenChair/glTF-Binary`            | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), © 2020 Wayfair, LLC; Eric Chadwick          |
| `TextureCoordinateTest.glb` | `Models/TextureCoordinateTest/glTF-Binary` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), © 2017 Analytical Graphics, Inc.; Ed Mackey |
| `Box.gltf`, `Box.bin`       | `Models/Box/glTF-Draco`                    | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), © 2017 Cesium                                   |

`TextureCoordinateTest.glb`'s own `asset.copyright` says CC BY 4.0, though the repository lists
it as CC0; the tests use that text to check the credits prefill.

The other cases (centimeters, Z-up, an off-center pivot, too many triangles, oversized and 8K+
textures, external URIs, invalid files, PNG with alpha, KTX2, and a `.gltf` with separate files)
are made from these files when the tests run, in `fixtures.ts`, so they carry the same licenses.
