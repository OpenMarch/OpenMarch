import itertools, io, contextlib, sys
sys.path.insert(0, ".")
with contextlib.redirect_stdout(io.StringIO()):
    from cvd import hex2rgb, de2000, simulate, contrast, KINDS
pool = ["D55E00","0072B2","009E73","CC79A7","E69F00","000000","882255","117733","332288","AA3377","4477AA","228833","EE6677","CC0077","7E22CE","994F00","006CD1","D41159","5D3A9B","E66100","56B4E9"]
pool=[p for p in pool if contrast(hex2rgb(p),(255,255,255))>=3]
D={}
for a,b in itertools.combinations(pool,2):
    D[a,b]=D[b,a]=min(de2000(simulate(hex2rgb(a),k),simulate(hex2rgb(b),k)) for k in KINDS)
res=[]
for combo in itertools.combinations(pool,5):
    res.append((min(D[a,b] for a,b in itertools.combinations(combo,2)),combo))
res.sort(reverse=True)
for m,c in res[:8]: print(f"{m:.1f}",c,[round(contrast(hex2rgb(h),(255,255,255)),2) for h in c])
