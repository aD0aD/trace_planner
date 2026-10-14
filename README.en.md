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
- Edit waypoint coordinates, type, verification, notes, reference links, and compressed images. Points farther than 100 m from the nearest recorded sample remain unassociated with mileage.
- Pick breakpoints on the map or profile, or split at waypoints. Automatic splitting uses recorded distance. Changing a segment boundary creates a new leg with new timing defaults.
- Itinerary estimates use distance / walking speed + ascent / climb rate, with rests added separately. Override moving time for terrain or group conditions. Missing elevation or route gaps require a manual time before later arrival times can be calculated.
- Latest passage deadlines refer to the departure day. For multiday trips, create daily routes and record overnight decision times in notes.
- Duplicate routes as alternatives, export itinerary CSV, and print a roadbook with route sketch, elevation profile, itinerary, waypoints, and other-route directory. The roadbook does not include online basemap tiles.
- Export filenames include role and revision. Trace Planner extensions in GPX/KML retain waypoint details; other navigation apps may ignore images, verification, and custom fields. Share project JSON for complete handover.
- Automatic drafts and up to 20 undo/redo states help preserve edits. History lasts for the page session. Storage failures are shown; download a project for backup.
- After a successful online visit and application caching, offline revisits support route editing, draft recovery, and export. Basemaps and external images still require a network connection; map tiles are not predownloaded.
- Routes are processed locally. Basemaps, URL imports, and external image references access their respective third-party services.

For development: `npm ci`, `npm test`, `npx playwright install chromium`, then `npm run test:browser`. GitHub Actions tests before deploying only the application files.

## 9. Local DEM terrain maps

For local use on macOS, double-click `start-local.command` and leave the terminal open, then visit <http://127.0.0.1:8765/Trace_planner.html>. Alternatively run `npm start` in the project directory. Opening HTML directly with `file://` cannot run the DEM worker; the page displays launch instructions. Download an existing project as JSON to move it from the file page into the HTTP preview.

The worker retains only the most recent projected elevation crop, with an 8 MiB height-cache limit (at most approximately 4.8 MB under the current output pixel budget). Contour-interval and hillshade changes reuse it without TIFF reads. Changing the crop, reopening sources, or removing DEMs invalidates the cache. It is session-only and excluded from projects and drafts.

Imported KML/GPX waypoints retain independent source IDs through coordinate edits, deletion, route switching, project restoration and undo/redo. Legacy points are matched at their original coordinates and assigned IDs before editing.

Expand **Local DEM terrain map** and select one or more elevation GeoTIFFs. The first release supports north-up, single-band WGS84 geographic rasters (EPSG:4326), with elevations in metres. For ASTER, select `_dem.tif`; `_num.tif` stores observation counts. Older ASTER rasters without a NoData tag use -9999 for voids.

- The default crop is the active route plus a 2 km buffer. Alternatively use the current map view or select two opposite crop corners on the map.
- Contours default to **20 m**. Available intervals are 10, 20, 50, 100 and 200 m, or off. Every fifth contour is emphasized; sufficiently long major contours have elevation labels.
- Toggle hillshade, visibility and automatic crop updates. Cancel a running computation when changing area.
- Export a terrain PNG with the active route, waypoints, interval, source names and scale bar. DEM rendering preserves original track elevations.

Files are read locally in a worker, in cropped raster windows. The projected output is limited to approximately 1.2 million pixels; embedded overviews are used when available. Large stripped files without overviews can still require substantial I/O. Individual decoded blocks over 32 MB and crops spanning too many blocks are rejected with a suggestion to narrow the crop or create a tiled GeoTIFF with overviews. NoData and uncovered areas stay transparent; color limits follow the valid elevations of the current crop.

Projects, drafts and undo snapshots store settings and source filenames/sizes, not TIFF contents. Reselect the required files after reopening a page or restoring a project that references different sources. Cached application assets allow offline use with newly selected local files. Use an HTTP server for local development, rather than opening the HTML file directly.

`npm run test:browser` includes synthetic GeoTIFF fixtures. Optional real-file validation:

```sh
DEM_TEST_FILES='/path/west_dem.tif;/path/east_dem.tif' \
DEM_TEST_KML='/path/route.kml' \
DEM_TEST_OUTPUT='/path/output' \
node tests/dem-browser.test.cjs
```

Real-file validation writes a 20 m terrain PNG, desktop/mobile screenshots, project JSON, and a crop report without copying source DEMs into the repository.
