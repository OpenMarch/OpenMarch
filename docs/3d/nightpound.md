<!-- cspell:ignore Daktronics sportsvideo -->

# Nightpound, OH

Nightpound is a fictional indoor arena for the 3D View, modeled on the University of Dayton Arena as WGI
dresses it for its World Championships. The model follows the real building's dimensions; every mark in it
is OpenMarch's own (no WGI, university or sponsor marks).

Unlike the other venues, Nightpound doesn't grow to fit the show's field. Its floor is WGI's competition
area, so only a field that fits it can be shown there.

## The fixed floor

- The competition area is **106 ft × 78 ft** (32.31 × 23.77 m), the size WGI uses for its color guard
  championships in this arena. Percussion and winds use 106 × 72 ft in the same arena. WGI's rules make
  78 × 106 ft the largest competition area allowed anywhere.
- `KIT_FIXED_FLOOR` in `view3d/core/venueSettings.ts` holds it. `kitFitsField` says whether a field fits,
  width along the front sideline and depth front to back, so the area doesn't fit turned sideways.
- The venue picker dims a venue the field doesn't fit, and a click says why. A show that already uses
  Nightpound and then changes to a bigger field sees the indoor arena (`KIT_FIXED_FLOOR_FALLBACK`), with a
  note in the venue settings.
- Every indoor and SoundSport template fits; no football field does.
- The show's floor lies at the center of the competition area.

## Coordinates

Kit-root space has its origin at the center of the competition area, at floor level:

- +Z is the front, the judges' side (section 113 in the real arena).
- −Z is the back, where the drape hangs.
- +X is the entry end and −X the exit end.

The arena's own center, under the center-hung board, is 2.74 m (9 ft) in front of the floor's center. For
WGI, the back side's lower rows fold away and the front side's stay out.

## Sources and confidence

Each number below is marked **M** (published measurement), **I** (inferred from photos, an aerial or seat
counts) or **G** (guess).

| What                            | Value                                                                                             | Source                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Competition area                | 106 × 78 ft (CG), 106 × 72 ft (percussion, winds)                                                 | M: WGI UD Arena site packets, 2019–2025 |
| Safety zone to seating          | 5 ft                                                                                              | M: WGI packets                          |
| Floor                           | concrete under a black tarp, strips about 9.5 ft wide front to back                               | M: WGI CG packet                        |
| Back drape                      | 11 ft black drape (12 ft in some CG years)                                                        | M: WGI packets                          |
| Curtain tunnel behind the drape | 11 ft 5 in wide, 10 ft 4 in high                                                                  | M: 2025 packet                          |
| Performance entry / exit        | 10 ft 11 in × 11 ft / 10 ft 8 in × 11 ft 1 in, at the back corners                                | M: 2025 packet                          |
| Hallway tunnel                  | 9 ft 6 in rail to rail, 9 ft high                                                                 | M: 2025 packet                          |
| Center-hung board               | bottom at 32 ft; four 13.5 × 20 ft faces, a 3 × 75 ft ring                                        | M: WGI packets, Daktronics (2017)       |
| End ribbon boards               | 3 × 100 ft                                                                                        | M: Daktronics (2017)                    |
| Floor walls                     | front Z +13.41, ends X ±19.0, fixed back wall Z −16.62                                            | I: packets, layout, audit photo solve   |
| Lower bowl                      | octagon; 100s 11 rows (telescopic), 200s 16 rows (13 at the ends), two red club rows on the sides | I: seat chart rows, photos              |
| Upper deck                      | 300s + 400s, 34 rows in one rake, on the two sides only                                           | I: seat chart rows, photos              |
| Roof                            | black steel trusses spanning the short way, bottom chord about 24.5 m; high roof 57.6 m along X   | I/G: photos ±2.5 m; aerial + OSM        |

The seating rows come from a fan seating site (RateYourSeats), so they're unofficial. A capacity check with
these numbers gives about 13,250 seats at a 21 in seat pitch, near the published 13,409.

Biggest uncertainties: the upper deck's rake and the roof's height (photo solves allow ±2.5 m), the lower
bowl's height, the exact wall positions (±0.6 m) and which end holds the Flight Deck.

## Size audit

An independent audit measured the real building without the builders' notes. It used OpenStreetMap and the 2015 aerial (scaled by Welcome Stadium's field) for the footprint, and camera solves of the 2025 WGI packet photo and a 2022 game photo (rulers: the 106 ft floor, the board's 32 ft clearance, a basketball court).

It found these right: the hall's depth across the court, the board's size, height and position, the ribbon boards, the drape line, the upper decks' length and rows, and the capacity (about 13,490 against 13,409).

It found the side stands too high for their depth and the high roof too long. These changes follow it:

| Constant                                           | Was      | Now                      |
| -------------------------------------------------- | -------- | ------------------------ |
| 200s rise (`MID.rise`)                             | 0.36     | 0.30                     |
| Club rows base                                     | 9.1      | 8.2                      |
| Concourse                                          | 9.5      | 8.6                      |
| Upper deck base, rise                              | 11, 0.34 | 9.6, 0.26 (top row 18.2) |
| High roof's half length (`ROOF.halfX`), end fascia | 34.5     | 28.8, 29                 |
| End walls (`FLOOR.minX/maxX`)                      | ±17.83   | ±19.0                    |

The audit's lower-confidence findings are left for later: the front 100s may have two rows folded for WGI, putting row A about 1.8 m further back, and the aux board may be taller.

Sources:

- WGI UD Arena site information packets: Color Guard 2019 and 2023, Percussion and Winds 2023, Percussion and
  Winds 2025 (wgi.org).
- Daktronics' 2017 release on the arena's displays (sportsvideo.org).
- Wikipedia, "UD Arena": capacity, history.
- RateYourSeats: sections and rows.
- Photos from Wikimedia Commons (2016–2024) and WGI event coverage (2017–2025), used for reference only.
