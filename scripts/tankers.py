"""Live oil and gas tanker positions for the Tankers page.

Every two hours, listens to the free aisstream.io feed for a few minutes, keeps ships whose AIS
type is 80-89 (tankers), and writes data/tankers.json. Ship types arrive in
static-data messages that each ship sends only every few minutes, so known
types are kept in data/ais-types.json between runs, and positions seen in the
last 24 hours are carried over so ships out of receiver range don't vanish.

Needs the AISSTREAM_API_KEY environment variable (a GitHub Actions secret) and
the `websockets` package.
"""
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "tankers.json"
TYPES = ROOT / "data" / "ais-types.json"
URL = "wss://stream.aisstream.io/v0/stream"
KEEP_HOURS = 24
TYPE_NAMES = {80: "Tanker", 81: "Tanker (hazardous A)", 82: "Tanker (hazardous B)", 83: "Tanker (hazardous C)", 84: "Tanker (hazardous D)", 89: "Tanker"}


def load(path, default):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def clean(s):
    return " ".join(str(s or "").replace("@", " ").split())[:40]


async def listen(key, seconds, types, ships):
    import websockets  # installed by the workflow

    sub = {"APIKey": key, "BoundingBoxes": [[[-90, -180], [90, 180]]], "FilterMessageTypes": ["PositionReport", "ShipStaticData"]}
    end = time.time() + seconds
    n = 0
    async with websockets.connect(URL, max_size=2**20, open_timeout=30) as ws:
        await ws.send(json.dumps(sub))
        while time.time() < end:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=max(1, end - time.time()))
            except asyncio.TimeoutError:
                break
            msg = json.loads(raw)
            if "error" in msg:
                raise RuntimeError(msg["error"])
            meta, kind = msg.get("MetaData", {}), msg.get("MessageType")
            mmsi = str(meta.get("MMSI") or "")
            if not mmsi:
                continue
            n += 1
            if kind == "ShipStaticData":
                sd = msg["Message"]["ShipStaticData"]
                if not (isinstance(sd.get("Type"), int) and 80 <= sd["Type"] <= 89):
                    types.pop(mmsi, None)  # only tankers are kept, so the file stays small
                    continue
                dim = sd.get("Dimension") or {}
                types[mmsi] = {
                    "t": sd.get("Type"),
                    "n": clean(sd.get("Name") or meta.get("ShipName")),
                    "d": clean(sd.get("Destination")),
                    "len": (dim.get("A") or 0) + (dim.get("B") or 0) or None,
                    "dr": sd.get("MaximumStaticDraught") or None,
                }
            elif kind == "PositionReport":
                pr = msg["Message"]["PositionReport"]
                lat, lon = pr.get("Latitude"), pr.get("Longitude")
                if lat is None or lon is None or abs(lat) > 90 or abs(lon) > 180:
                    continue  # 91/181 mean "not available"
                ships[mmsi] = {
                    "lat": round(lat, 2), "lon": round(lon, 2),
                    "sog": round(pr["Sog"], 1) if isinstance(pr.get("Sog"), (int, float)) and pr["Sog"] < 102 else None,
                    "cog": round(pr["Cog"]) if isinstance(pr.get("Cog"), (int, float)) and pr["Cog"] < 360 else None,
                    "st": pr.get("NavigationalStatus"),
                    "ts": int(time.time()),
                    "n": clean(meta.get("ShipName")),
                }
    return n


def main():
    key = os.environ.get("AISSTREAM_API_KEY")
    if not key:
        print("AISSTREAM_API_KEY not set, skipping")
        return
    seconds = int(sys.argv[1]) if len(sys.argv) > 1 else 600
    types = load(TYPES, {})
    prev = load(OUT, {}).get("ships", [])
    ships = {s["m"]: {k: v for k, v in s.items() if k in ("lat", "lon", "sog", "cog", "st", "ts", "n")} for s in prev}
    try:
        n = asyncio.run(listen(key, seconds, types, ships))
        print(f"received {n} messages")
    except Exception as e:
        print(f"stream failed: {e}", file=sys.stderr)
        if not prev:
            sys.exit(1)

    cutoff = time.time() - KEEP_HOURS * 3600
    out = []
    for m, s in ships.items():
        info = types.get(m) or {}
        t = info.get("t")
        if not (isinstance(t, int) and 80 <= t <= 89) or s["ts"] < cutoff:
            continue
        row = {"m": m, "n": info.get("n") or s.get("n") or "Unknown", "lat": s["lat"], "lon": s["lon"], "sog": s.get("sog"), "cog": s.get("cog"),
               "st": s.get("st"), "ts": s["ts"], "d": info.get("d"), "len": info.get("len"), "dr": info.get("dr"), "t": t}
        out.append({k: v for k, v in row.items() if v not in (None, "")})
    out.sort(key=lambda r: r["m"])
    TYPES.write_text(json.dumps(types, separators=(",", ":")))
    OUT.write_text(json.dumps({"updatedAt": datetime.now(timezone.utc).isoformat(), "ships": out}, separators=(",", ":")))
    print(f"tankers: {len(out)} (types known for {len(types)} ships)")


if __name__ == "__main__":
    main()
