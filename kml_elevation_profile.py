#!/usr/bin/env python3
import argparse
import math
import xml.etree.ElementTree as ET

import matplotlib.pyplot as plt


KML_NS = {"kml": "http://www.opengis.net/kml/2.2", "gx": "http://www.google.com/kml/ext/2.2"}


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371008.8
    p = math.pi / 180.0
    dlat = (lat2 - lat1) * p
    dlon = (lon2 - lon1) * p
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def moving_average(vals, window=5):
    half = window // 2
    out = []
    for i in range(len(vals)):
        a = max(0, i - half)
        b = min(len(vals), i + half + 1)
        out.append(sum(vals[a:b]) / (b - a))
    return out


def parse_kml(path):
    tree = ET.parse(path)
    root = tree.getroot()

    points = []

    # 1) Merge all LineString coordinates.
    for node in root.findall(".//kml:LineString/kml:coordinates", KML_NS):
        raw = (node.text or "").strip()
        if not raw:
            continue
        for token in raw.split():
            p = token.split(",")
            if len(p) < 2:
                continue
            lon = float(p[0])
            lat = float(p[1])
            ele = float(p[2]) if len(p) >= 3 else None
            points.append((lat, lon, ele))

    # 2) Fallback gx:Track.
    if len(points) < 2:
        for node in root.findall(".//gx:Track/gx:coord", KML_NS):
            raw = (node.text or "").strip()
            if not raw:
                continue
            p = raw.split()
            if len(p) < 2:
                continue
            lon = float(p[0])
            lat = float(p[1])
            ele = float(p[2]) if len(p) >= 3 else None
            points.append((lat, lon, ele))

    # remove consecutive duplicates
    dedup = []
    for pt in points:
        if not dedup or (pt[0], pt[1]) != (dedup[-1][0], dedup[-1][1]):
            dedup.append(pt)
    if len(dedup) < 2:
        raise ValueError("KML 中未找到有效轨迹")

    # fill missing elevation by interpolation
    elev = [pt[2] for pt in dedup]
    idx_known = [i for i, v in enumerate(elev) if v is not None]
    if not idx_known:
        raise ValueError("KML 轨迹没有海拔数据")

    first = idx_known[0]
    for i in range(0, first):
        elev[i] = elev[first]
    last = first
    for i in idx_known[1:]:
        v0 = elev[last]
        v1 = elev[i]
        for j in range(last + 1, i):
            t = (j - last) / (i - last)
            elev[j] = v0 + (v1 - v0) * t
        last = i
    for i in range(last + 1, len(elev)):
        elev[i] = elev[last]

    return dedup, elev


def compute_profile(points, elev):
    dist_m = [0.0]
    for i in range(1, len(points)):
        dist_m.append(
            dist_m[-1]
            + haversine_m(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
        )

    smooth = moving_average(elev, window=5)
    gain = 0.0
    loss = 0.0
    for i in range(1, len(smooth)):
        de = smooth[i] - smooth[i - 1]
        if abs(de) < 1.0:
            continue
        if de > 0:
            gain += de
        else:
            loss += -de
    return dist_m, smooth, gain, loss


def main():
    parser = argparse.ArgumentParser(description="从 KML 导出海拔剖面图（含横纵坐标）")
    parser.add_argument("kml", help="输入 KML 文件路径")
    parser.add_argument("-o", "--output", default="elevation_profile.png", help="输出 PNG 路径")
    parser.add_argument("--title", default="Elevation Profile", help="图标题")
    args = parser.parse_args()

    points, elev = parse_kml(args.kml)
    dist_m, smooth, gain, loss = compute_profile(points, elev)

    x_km = [d / 1000.0 for d in dist_m]
    y = smooth

    plt.figure(figsize=(12, 4.8), dpi=220)
    plt.fill_between(x_km, y, alpha=0.2)
    plt.plot(x_km, y, linewidth=1.4)
    plt.title(args.title)
    plt.xlabel("Distance (km)")
    plt.ylabel("Elevation (m)")
    plt.grid(alpha=0.3)

    total_km = x_km[-1]
    text = f"Dist={total_km:.2f} km  Gain={gain:.1f} m  Loss={loss:.1f} m"
    plt.text(0.01, 0.02, text, transform=plt.gca().transAxes, fontsize=9, va="bottom")
    plt.tight_layout()
    plt.savefig(args.output)
    print(f"Saved: {args.output}")
    print(text)


if __name__ == "__main__":
    main()
