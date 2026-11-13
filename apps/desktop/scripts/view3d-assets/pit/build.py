# cspell:words pitlib
# cspell:words argparse
# Builds the whole front ensemble as GLBs, a detailed and a distant model each.
#
#   blender -b --factory-startup --python build.py -- --out out-dir [--only id,id]
#
# Writes <out-dir>/<id>.glb, <id>-low.glb and manifest.json.
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import audio  # noqa: E402
import drums  # noqa: E402
import keys  # noqa: E402
import mallets  # noqa: E402
import metals  # noqa: E402
import pitlib  # noqa: E402
import podiums  # noqa: E402
import racks  # noqa: E402


def mallet(size, bars, resonators, vibe=False):
    def make(parts, high):
        mallets.build_mallet(parts, high, mallets.SIZES[size], bars, resonators, vibe)

    return make


def call(fn, **kw):
    return lambda parts, high: fn(parts, high, **kw)


CATALOG = {}
for size in ("4.3", "4.6", "5.0"):
    CATALOG[f"marimba-{size}"] = mallet(f"marimba-{size}", "bars-rosewood", "resonators-gold")
    CATALOG[f"marimba-{size}-synthetic-black"] = mallet(f"marimba-{size}", "bars-synthetic", "resonators-black")
for size in ("3.0", "3.5"):
    CATALOG[f"vibraphone-{size}"] = mallet(f"vibraphone-{size}", "bars-silver", "resonators-gold", True)
    CATALOG[f"vibraphone-{size}-gold"] = mallet(f"vibraphone-{size}", "bars-gold", "resonators-silver", True)
CATALOG["xylophone-3.5"] = mallet("xylophone-3.5", "bars-rosewood", "resonators-gold")
CATALOG["xylophone-3.5-synthetic-black"] = mallet("xylophone-3.5", "bars-synthetic", "resonators-black")
CATALOG["glockenspiel-2.5"] = call(mallets.glockenspiel)
for k in (61, 88):
    CATALOG[f"synth-{k}"] = call(keys.synth, keys=k)
    CATALOG[f"synth-{k}-double"] = call(keys.synth, keys=k, tiers=2)
CATALOG["drum-set"] = call(drums.drum_set)
CATALOG["drum-set-cage"] = call(drums.drum_set, cage=True)
for d in (23, 26, 29, 32):
    CATALOG[f"timpani-{d}"] = call(drums.timpani, inches=d)
for d in (32, 36):
    CATALOG[f"concert-bass-{d}"] = call(drums.concert_bass, inches=d)
for d in (32, 36, 40):
    CATALOG[f"gong-{d}"] = call(metals.gong, inches=d)
CATALOG["aux-rack-accessories"] = call(racks.rack_accessories)
CATALOG["aux-rack-toms"] = call(racks.rack_toms)
CATALOG["aux-rack-mixed"] = call(racks.rack_mixed)
CATALOG["trap-table"] = call(racks.trap_table)
CATALOG["chimes"] = call(metals.chimes)
CATALOG["congas"] = call(drums.congas)
CATALOG["bongos"] = call(drums.bongos)
CATALOG["speaker-wide"] = call(audio.speaker_wide)
CATALOG["speaker-square"] = call(audio.speaker_square)
CATALOG["speaker-tall"] = call(audio.speaker_tall)
CATALOG["mixer-cart"] = call(audio.mixer_cart)
CATALOG["mixer-cart-covered"] = call(audio.mixer_cart, covered=True)
CATALOG["amp-guitar"] = call(audio.amp_guitar)
CATALOG["amp-bass"] = call(audio.amp_bass)
CATALOG["conductor-podium"] = call(podiums.conductor_podium)
CATALOG["conductor-podium-tall"] = call(podiums.conductor_podium, tall=True)
for finish in ("", "-black"):
    black = bool(finish)
    CATALOG[f"podium-stand-2ft{finish}"] = call(podiums.stand, black=black)
    CATALOG[f"podium-tower-4ft{finish}"] = call(podiums.tower, height_ft=4, black=black)
    CATALOG[f"podium-tower-5ft{finish}"] = call(podiums.tower, height_ft=5, black=black)
    CATALOG[f"podium-tower-6ft{finish}"] = call(podiums.tower, height_ft=6, black=black, rail="full")
    CATALOG[f"podium-rolling-6ft{finish}"] = call(podiums.rolling, black=black)
CATALOG["stepladder-6ft"] = call(podiums.stepladder)
CATALOG["scaffold-tower"] = call(podiums.scaffold)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--only", default="")
    args = p.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    ids = [i for i in args.only.split(",") if i] or list(CATALOG)
    path = os.path.join(args.out, "manifest.json")
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    for model_id in ids:
        entry = {}
        for high, suffix in ((True, ""), (False, "-low")):
            parts = pitlib.Parts()
            CATALOG[model_id](parts, high)
            parts.consolidate()
            info = pitlib.export_model(model_id, parts, args.out, suffix)
            info["artworkSlots"] = {k: list(v) for k, v in parts.slots.items()}
            entry["high" if high else "low"] = info
            if parts.stand is not None:
                # Blender (x, y, z) is glTF (x, z, -y): where the feet go, and how high.
                x, y, z = parts.stand
                entry["standTopM"] = round(z, 4)
                entry["standAtM"] = [round(x, 4), round(-y, 4) + 0.0]
        manifest[model_id] = entry
        print("BUILT", model_id, entry["high"]["triangles"], entry["low"]["triangles"], entry["high"]["sizeM"])
    with open(path, "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)


main()
