# Trace Planner (English Guide)

Trace Planner is a browser-based route stitching and analysis tool for hiking/trekking workflows.  
No installation, no login, and no backend required for normal use.

- Website: [https://ad0ad.github.io/trace_planner/](https://ad0ad.github.io/trace_planner/)
- UI Languages: Chinese / English (top-right switch)
- Themes: Light / Dark (top-right switch)

---

## 1) Core Features

### Track Import & Map View
- Import `KML`, `KMZ`, and `GPX`
- Work with multiple tracks in one project
- Switch map base layers (Satellite / Topographic / Street) with hillshade overlay

### Track Stitching
- Clip segments from any imported track
- Reverse segments for opposite direction routes
- Reorder segment basket and build a stitched route

### Analysis
- Total distance, ascent, and descent
- Breakpoint-based segment statistics
- Live elevation profile linked with start/end selectors
- Multiple climb calculation modes: raw / smoothed / smoothed + threshold

### Annotation System
- Typed color presets (start, end, camp, supply, risk, note)
- Click-to-add map annotations
- Text + optional image annotations
- Annotation list actions: Locate / Edit / Delete

### Export & Project Persistence
- Export tracks as `KML`, `GPX`, `GeoJSON`
- Export elevation chart as `PNG`
- Save full project as `project.json` (download or browser-local)

---

## 2) Quick Start (Recommended Flow)

1. Open the website and choose your preferred language/theme  
2. Import one or multiple track files  
3. Use **Track Stitching** tab to clip and merge segments  
4. Use **Track Analysis** tab for segment metrics, profile, and annotations  
5. Export route files or save project JSON

---

## 3) Project Save Strategy (Important)

You have two save options:

- **Download Project JSON (recommended)**  
  - Works across devices
  - Easy backup and sharing
- **Save in Browser**  
  - Local to this browser only
  - Can be lost after clearing site data

Best practice: download a `project.json` after each major edit.

---

## 4) Supported Formats

### Input
- `KML`
- `KMZ`
- `GPX`

### Output
- `KML`
- `GPX`
- `GeoJSON`
- `PNG` (elevation chart)
- `project.json` (full project state)

---

## 5) Privacy & Data Handling

- Route/project files are processed locally in your browser
- The website does not upload or store your files
- Base maps come from third-party tile providers (standard map traffic behavior)

---

## 6) FAQ

### Why do ascent/descent values differ between files?
Different devices and recording methods produce different elevation noise.  
Try switching climb modes for comparison.

### Why is browser-local project missing?
Browser-local storage is not cross-device and may be removed by cache/site-data cleanup.  
Use downloaded `project.json` for reliable backup.

### Why does a project fail to load?
The JSON may be damaged or manually edited.  
Prefer loading original files exported by Trace Planner.

---

## 7) License

MIT (see `LICENSE`)

