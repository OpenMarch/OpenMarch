## Contrast: field inks on the default white field

| color                         | white field |
| ----------------------------- | ----------- |
| default marcher red (255,0,0) | 4.00        |
| collision red [1,0,0]         | 4.00        |
| step-size warning (220,38,38) | 4.83        |
| next path green (0,175,13)    | 2.94        |
| selection blue #0d6efd        | 4.50        |
| shape purple (126,34,206)     | 6.98        |
| temp path (192,132,252)       | 2.64        |
| guide ink #ea580c             | 3.56        |
| pivot #facc15                 | 1.53        |
| ghost gray #6f6f6f            | 5.02        |
| primary stroke black          | 21.00       |
| secondary grid #aaa           | 2.32        |
| tertiary grid #ddd            | 1.36        |
| yard numbers #888             | 3.54        |
| marcher label black           | 21.00       |

## Field: pairs that must be told apart

| pair                                                          | normal | protan | deutan | tritan |
| ------------------------------------------------------------- | ------ | ------ | ------ | ------ | ------- |
| default marcher red (255,0,0) / collision red [1,0,0]         | 0.0    | 0.0    | 0.0    | 0.0    | **<10** |
| default marcher red (255,0,0) / next path green (0,175,13)    | 77.1   | 24.6   | 2.6    | 66.0   | **<10** |
| next path green (0,175,13) / step-size warning (220,38,38)    | 76.3   | 29.1   | 6.5    | 67.7   | **<10** |
| default marcher red (255,0,0) / step-size warning (220,38,38) | 7.9    | 6.0    | 6.7    | 5.7    | **<10** |
| selection blue #0d6efd / shape purple (126,34,206)            | 23.2   | 15.5   | 9.1    | 38.7   | **<10** |
| selection blue #0d6efd / temp path (192,132,252)              | 23.7   | 9.2    | 16.1   | 41.3   | **<10** |
| shape purple (126,34,206) / temp path (192,132,252)           | 28.0   | 24.5   | 25.6   | 26.8   |
| guide ink #ea580c / default marcher red (255,0,0)             | 9.7    | 7.8    | 1.3    | 10.7   | **<10** |
| guide ink #ea580c / step-size warning (220,38,38)             | 14.4   | 12.4   | 8.0    | 7.1    | **<10** |
| pivot #facc15 / guide ink #ea580c                             | 38.1   | 27.7   | 18.4   | 26.0   |
| next path green (0,175,13) / ghost gray #6f6f6f               | 33.1   | 31.7   | 27.8   | 28.4   |

## Contrast: UI inks, light theme

| color                          | bg-1 light |
| ------------------------------ | ---------- |
| accent / playhead (100,66,255) | 4.70       |
| start flag ochre (150,120,0)   | 3.55       |
| start flag text (115,90,0)     | 5.55       |
| red (176,51,51)                | 5.26       |
| green (72,158,51)              | 2.85       |
| yellow (200,170,0)             | 1.92       |
| waveform (180,180,180)         | 1.75       |
| text (32,32,32)                | 13.74      |
| subtitle text 60%              | 4.09       |
| stroke 10% black               | 1.25       |

## Contrast: UI inks, dark theme

| color                           | bg-1 dark |
| ------------------------------- | --------- |
| accent / playhead (150,126,255) | 6.16      |
| start flag yellow (236,211,71)  | 12.79     |
| red (227,74,74)                 | 4.89      |
| green (113,222,86)              | 11.24     |
| waveform (180,180,180)          | 9.27      |
| text (208,208,208)              | 12.46     |
| subtitle text 60%               | 5.03      |
| stroke 6% white                 | 1.14      |

## Timeline: playhead vs start flag vs error red (light)

| pair                                                          | normal | protan | deutan | tritan |
| ------------------------------------------------------------- | ------ | ------ | ------ | ------ |
| accent / playhead (100,66,255) / start flag ochre (150,120,0) | 67.6   | 63.5   | 66.0   | 40.9   |
| red (176,51,51) / green (72,158,51)                           | 65.7   | 28.9   | 12.4   | 62.4   |
| red (176,51,51) / start flag ochre (150,120,0)                | 37.9   | 20.1   | 10.8   | 18.2   |

## Timeline: playhead vs start flag vs error red (dark)

| pair                                                             | normal | protan | deutan | tritan |
| ---------------------------------------------------------------- | ------ | ------ | ------ | ------ |
| accent / playhead (150,126,255) / start flag yellow (236,211,71) | 70.0   | 63.4   | 63.9   | 36.0   |
| red (227,74,74) / green (113,222,86)                             | 74.1   | 34.1   | 16.0   | 69.9   |

### Timeline track colors (timelineViewModel.ts) (8 colors)

- normal: min 14.8 (7c8cf8/4aa3e0), pairs<10: 0
- protan: min 3.5 (7c8cf8/c27be0), pairs<10: 4
- deutan: min 1.7 (c27be0/4aa3e0), pairs<10: 5
- tritan: min 3.5 (e56a82/e0784a), pairs<10: 7

## Timeline track colors, worst pairs

| pair            | normal | protan | deutan | tritan |
| --------------- | ------ | ------ | ------ | ------ | ------- |
| 2fc4b2 / e79b00 | 44.1   | 25.6   | 34.0   | 58.0   |
| 2fc4b2 / e56a82 | 63.3   | 16.9   | 18.2   | 66.2   |
| 2fc4b2 / 7c8cf8 | 38.2   | 30.5   | 22.4   | 15.7   |
| 2fc4b2 / 62b851 | 21.4   | 21.7   | 27.5   | 7.8    | **<10** |
| 2fc4b2 / c27be0 | 44.4   | 29.4   | 17.2   | 54.0   |
| 2fc4b2 / e0784a | 52.1   | 23.2   | 29.3   | 63.4   |
| 2fc4b2 / 4aa3e0 | 27.5   | 24.9   | 18.5   | 8.1    | **<10** |
| e79b00 / e56a82 | 41.3   | 28.4   | 20.3   | 9.8    | **<10** |
| e79b00 / 7c8cf8 | 57.0   | 58.8   | 61.5   | 55.7   |
| e79b00 / 62b851 | 38.2   | 5.4    | 10.4   | 53.1   | **<10** |
| e79b00 / c27be0 | 57.5   | 56.2   | 54.7   | 17.3   |
| e79b00 / e0784a | 20.4   | 12.9   | 9.6    | 7.6    | **<10** |
| e79b00 / 4aa3e0 | 50.0   | 52.0   | 56.3   | 53.2   |
| e56a82 / 7c8cf8 | 33.9   | 26.8   | 40.5   | 60.1   |
| e56a82 / 62b851 | 67.7   | 26.7   | 10.9   | 60.3   |
| e56a82 / c27be0 | 23.0   | 24.3   | 35.3   | 17.1   |
| e56a82 / e0784a | 21.2   | 19.8   | 12.7   | 3.5    | **<10** |
| e56a82 / 4aa3e0 | 47.3   | 23.4   | 36.4   | 71.8   |
| 7c8cf8 / 62b851 | 55.0   | 55.2   | 52.7   | 15.1   |
| 7c8cf8 / c27be0 | 17.6   | 3.5    | 6.2    | 45.2   | **<10** |
| 7c8cf8 / e0784a | 44.2   | 50.7   | 54.6   | 59.1   |
| 7c8cf8 / 4aa3e0 | 14.8   | 6.6    | 4.7    | 8.2    | **<10** |
| 62b851 / c27be0 | 76.6   | 52.8   | 46.6   | 44.3   |
| 62b851 / e0784a | 52.6   | 12.4   | 2.6    | 57.9   | **<10** |
| 62b851 / 4aa3e0 | 50.1   | 48.5   | 47.9   | 9.7    | **<10** |
| c27be0 / e0784a | 39.8   | 47.9   | 48.4   | 18.0   |
| c27be0 / 4aa3e0 | 33.5   | 6.2    | 1.7    | 52.1   | **<10** |
| e0784a / 4aa3e0 | 46.7   | 45.1   | 49.8   | 57.3   |

## Contrast: Timeline track colors (as bars/paths)

| color  | bg-1 light | bg-1 dark | white field |
| ------ | ---------- | --------- | ----------- |
| 2fc4b2 | 1.83       | 8.84      | 2.17        |
| e79b00 | 1.95       | 8.32      | 2.31        |
| e56a82 | 2.64       | 6.15      | 3.13        |
| 7c8cf8 | 2.54       | 6.37      | 3.02        |
| 62b851 | 2.08       | 7.77      | 2.47        |
| c27be0 | 2.46       | 6.59      | 2.92        |
| e0784a | 2.55       | 6.37      | 3.02        |
| 4aa3e0 | 2.33       | 6.96      | 2.76        |

### Line interval groups (groupDrawing.ts, Okabe-Ito subset) (5 colors)

- normal: min 22.2 (E69F00/D55E00), pairs<10: 0
- protan: min 12.3 (0072B2/CC79A7), pairs<10: 0
- deutan: min 12.5 (E69F00/D55E00), pairs<10: 0
- tritan: min 11.1 (E69F00/CC79A7), pairs<10: 0

### Okabe-Ito (8) (8 colors)

- normal: min 21.7 (orange/yellow), pairs<10: 0
- protan: min 12.3 (blue/reddish purple), pairs<10: 0
- deutan: min 11.5 (orange/yellow), pairs<10: 0
- tritan: min 11.1 (orange/reddish purple), pairs<10: 0

## Contrast: Okabe-Ito (8)

| color          | white field | bg-1 dark |
| -------------- | ----------- | --------- |
| orange         | 2.25        | 8.53      |
| sky blue       | 2.31        | 8.33      |
| bluish green   | 3.42        | 5.62      |
| yellow         | 1.32        | 14.54     |
| blue           | 5.19        | 3.71      |
| vermilion      | 3.87        | 4.97      |
| reddish purple | 3.06        | 6.28      |
| black          | 21.00       | 1.09      |

### Paul Tol bright (7) (7 colors)

- normal: min 20.7 (cyan/grey), pairs<10: 0
- protan: min 14.0 (blue/purple), pairs<10: 0
- deutan: min 14.7 (blue/purple), pairs<10: 0
- tritan: min 8.7 (blue/green), pairs<10: 1

## Contrast: Paul Tol bright (7)

| color  | white field | bg-1 dark |
| ------ | ----------- | --------- |
| blue   | 4.70        | 4.09      |
| cyan   | 1.84        | 10.47     |
| green  | 4.53        | 4.24      |
| yellow | 1.95        | 9.85      |
| red    | 3.09        | 6.23      |
| purple | 6.09        | 3.16      |
| grey   | 1.92        | 10.01     |

### Paul Tol muted (9) (9 colors)

- normal: min 15.0 (wine/purple), pairs<10: 0
- protan: min 11.8 (indigo/wine), pairs<10: 0
- deutan: min 14.0 (teal/rose), pairs<10: 0
- tritan: min 11.6 (rose/purple), pairs<10: 0

## Contrast: Paul Tol muted (9)

| color  | white field | bg-1 dark |
| ------ | ----------- | --------- |
| indigo | 12.17       | 1.58      |
| cyan   | 1.76        | 10.91     |
| teal   | 2.82        | 6.82      |
| green  | 5.66        | 3.40      |
| olive  | 3.02        | 6.37      |
| sand   | 1.62        | 11.88     |
| rose   | 3.66        | 5.25      |
| wine   | 8.73        | 2.20      |
| purple | 5.26        | 3.66      |

### Proposed track/section set (8) (8 colors)

- normal: min 17.4 (orange E69F00/sand DDCC77), pairs<10: 0
- protan: min 9.2 (pink CC79A7/blue 4477AA), pairs<10: 1
- deutan: min 10.5 (orange E69F00/sand DDCC77), pairs<10: 0
- tritan: min 11.1 (orange E69F00/pink CC79A7), pairs<10: 0

## Contrast: Proposed track/section set (8)

| color            | white field | bg-1 dark |
| ---------------- | ----------- | --------- |
| orange E69F00    | 2.25        | 8.53      |
| sky 56B4E9       | 2.31        | 8.33      |
| green 009E73     | 3.42        | 5.62      |
| vermilion D55E00 | 3.87        | 4.97      |
| pink CC79A7      | 3.06        | 6.28      |
| blue 4477AA      | 4.70        | 4.09      |
| sand DDCC77      | 1.62        | 11.88     |
| grey BBBBBB      | 1.92        | 10.01     |

## Contrast: Proposed field state inks

| color                                    | white field |
| ---------------------------------------- | ----------- |
| marcher default (Okabe vermilion D55E00) | 3.87        |
| selection blue 0072B2                    | 5.19        |
| next path (bluish green 009E73)          | 3.42        |
| warning/collision magenta (CC0077)       | 5.48        |
| shape purple (126,34,206)                | 6.98        |

## Proposed field state inks

| pair                                                                          | normal | protan | deutan | tritan |
| ----------------------------------------------------------------------------- | ------ | ------ | ------ | ------ | ------- |
| marcher default (Okabe vermilion D55E00) / selection blue 0072B2              | 49.6   | 50.0   | 56.5   | 54.6   |
| marcher default (Okabe vermilion D55E00) / next path (bluish green 009E73)    | 54.4   | 18.2   | 20.5   | 62.7   |
| marcher default (Okabe vermilion D55E00) / warning/collision magenta (CC0077) | 39.6   | 45.1   | 26.6   | 7.9    | **<10** |
| marcher default (Okabe vermilion D55E00) / shape purple (126,34,206)          | 53.7   | 61.7   | 65.4   | 31.6   |
| selection blue 0072B2 / next path (bluish green 009E73)                       | 38.4   | 38.4   | 34.5   | 12.1   |
| selection blue 0072B2 / warning/collision magenta (CC0077)                    | 47.4   | 14.0   | 24.5   | 66.8   |
| selection blue 0072B2 / shape purple (126,34,206)                             | 30.5   | 10.5   | 5.8    | 35.8   | **<10** |
| next path (bluish green 009E73) / warning/collision magenta (CC0077)          | 78.5   | 40.1   | 9.3    | 66.5   | **<10** |
| next path (bluish green 009E73) / shape purple (126,34,206)                   | 52.4   | 50.3   | 41.1   | 41.7   |
| warning/collision magenta (CC0077) / shape purple (126,34,206)                | 23.1   | 12.3   | 30.0   | 28.8   |
