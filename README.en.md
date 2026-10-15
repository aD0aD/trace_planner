# Trace Planner (English Guide)

Trace Planner is a browser-based route stitching and analysis tool for hiking/trekking workflows.
No installation, no login, and no backend required for normal use.

- Website: [https://ad0ad.github.io/trace_planner/](https://ad0ad.github.io/trace_planner/)
- UI Languages: Chinese / English (top-right toggle)
- Themes: Light / Dark (top-right switch)

---

## 1) Core Features

### Track Import & Map View
- Import `KML`, `KMZ`, and `GPX`
- Work with multiple tracks in one project
- Keyword track lookup on 2bulu / Sixfoot (opens site search pages)
- Switch map base layers (Satellite / Topographic / Street) with hillshade overlay
- A segmented scale bar in the lower left updates metres/kilometres as you zoom and pan; no DEM is required

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


## 8) Leader planning (v3)

- Routes independently retain annotations, breakpoints, itinerary settings, names, revisions, and roles (main / alternative / escape). Stitched routes stay in the route list.
- GPX track segments and KML line boundaries are preserved. GPX routes (`rtept`) are supported; all KML files and referenced embedded images in a KMZ are read.
- Red dashed connections are unconfirmed gaps, excluded from recorded distance and climb. Exports preserve separate segments. A dashed connection does not establish a walkable trail.
- Missing elevation remains unknown. Smoothing does not cross gaps or missing measurements; threshold accumulation retains gradual climbs. Sampling density and recording devices still affect results.
- Coordinates are read as WGS84 without automatic conversion. Check alignment against known landmarks.
- Edit waypoint coordinates, type, verification, notes, reference links, and compressed images. Imported waypoint edits and deletions persist across route switching and project restoration; moving a point does not recreate it at its original location. Points farther than 100 m from the nearest recorded sample remain unassociated with mileage.
- Pick breakpoints on the map or profile, or split at waypoints. Automatic splitting uses recorded distance. Changing a segment boundary creates a new leg with new timing defaults.
- Itinerary estimates use distance / walking speed + ascent / climb rate, with rests added separately. Override moving time for terrain or group conditions. Missing elevation or route gaps require a manual time before later arrival times can be calculated.
- Latest passage deadlines refer to the departure day. For multiday trips, create daily routes and record overnight decision times in notes.
- Duplicate routes as alternatives, export itinerary CSV, and print a roadbook with route sketch, elevation profile, itinerary, waypoints, and other-route directory. The roadbook does not include online basemap tiles.
- Export filenames include role and revision. Trace Planner extensions in GPX/KML retain waypoint details; other navigation apps may ignore images, verification, and custom fields. Share project JSON for complete handover.
- Automatic drafts and up to 20 undo/redo states help preserve edits. History lasts for the page session. Storage failures are shown; download a project for backup.
- After a successful online visit and application caching, offline revisits support route editing, draft recovery, and export. Basemaps and external images still require a network connection; map tiles are not predownloaded.
- Routes are processed locally. Basemaps, URL imports, and external image references access their respective third-party services.

## 9. DEM terrain maps

Open the [website](https://ad0ad.github.io/trace_planner/), expand **Local DEM terrain map**, and select `.tif / .tiff` files covering your route. Supported GeoTIFFs are north-up, single-band WGS84 geographic rasters (EPSG:4326), with elevations in metres. For ASTER GDEM, select `_dem.tif`; `_num.tif` contains observation counts, not elevations.

1. Import a GPX/KML route, then add DEM files. Hold ⌘ (Mac) or Ctrl (Windows) to select several files in one folder. Files from different folders can be added in separate selections; existing DEMs remain loaded.
2. The default crop is the active route plus a 2 km buffer. Alternatively select the current map view or click **Select crop on map** and choose two opposite corners.
3. Contours default to **20 m**. Choose 10, 20, 50, 100 or 200 m, or turn contours off. Every fifth contour is emphasized; sufficiently long major contours have elevation labels.
4. Toggle hillshade, terrain visibility and automatic crop updates. Remove individual files from the list or clear the entire set with **Remove DEM**. Reselecting the same filename and coverage updates that file.
5. Choose **Export terrain PNG** to save terrain, the active route, waypoints, contour interval and scale bar.

Uncovered areas and missing elevations stay blank. For large datasets, start with a smaller crop. Terrain detail is limited by the source DEM resolution, and original track elevations remain unchanged.

DEM files are processed in your browser and are not uploaded. Project JSON saves drawing settings and source-file information, but does not include the DEM itself. Reselect the corresponding DEM files when reopening a project.
