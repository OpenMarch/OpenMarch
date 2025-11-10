from pathlib import Path
import json

svg_path = Path("svgs.json")

with svg_path.open('r') as f:
  svgs = json.load(f)

for i in range(len(svgs)):
  with Path(f"{i}.svg").open('w') as f:
    f.write(svgs[i])
