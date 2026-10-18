# Development and validation

Use Node.js 22 and Python 3 for local development. The public application is
available at https://ad0ad.github.io/trace_planner/; normal users do not need a
local server or development tools.

## Local preview

```sh
npm ci --ignore-scripts
npm start
```

Open http://127.0.0.1:8765/Trace_planner.html and leave the server running.
On macOS, `start-local.command` provides the same local preview.

Serve the application over HTTP rather than opening the HTML with `file://`:
the DEM worker requires a web origin. Browser storage is specific to the origin;
download project JSON to transfer edits between a file page, local preview and
the published site.

## Tests and Pages packaging

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run test:site
```

`npm test` runs route and terrain calculations. Browser integration covers route
editing, imported waypoint identity, DEM seams and NoData, bulk and incremental
imports, removal and reselection, crop-cache invalidation, export, responsive
layout and offline revisits.

`npm run build` assembles the public application into `site/` using an explicit
asset list. `npm run test:site` builds it and runs the browser tests against that
directory. GitHub Actions performs these checks for PRs; main deployments use
the same tested Pages artifact. Source DEMs, test output, development tools and
dependencies are excluded from the public directory.

## Optional real-file DEM validation

```sh
npm run build
TRACE_TEST_ROOT=site \
DEM_TEST_FILES='/path/west_dem.tif;/path/east_dem.tif' \
DEM_TEST_KML='/path/route.kml' \
DEM_TEST_OUTPUT='/path/output' \
node tests/dem-browser.test.cjs
```

The optional run writes terrain PNG, desktop/mobile screenshots, project JSON
and a crop report. Keep private datasets outside the repository; generated
`output/` and `site/` directories are ignored by Git.

## DEM implementation limits

The worker reads metadata first, then cropped raster windows in batches. It uses
embedded overviews when appropriate and samples sources into one Web Mercator
grid before extracting contours. ASTER voids use -9999 when older files omit a
NoData tag.

The projected grid is limited to approximately 1.2 million pixels. Only the most
recent height grid is cached, with an 8 MiB height-buffer ceiling. Crop changes,
source updates and removals invalidate it; contour and hillshade changes reuse
it. Decoded TIFF blocks and contour complexity have separate limits. Large
stripped TIFFs without overviews may still require substantial I/O; prefer tiled
GeoTIFFs with overviews for large datasets.

These caches are session-only and excluded from project snapshots. Original
track elevations remain independent from DEM rendering.

## Photo-heavy projects

Project downloads use version 4 with a lossless image asset table. The loader
expands it before normal validation and still accepts older project files.
Older application versions reject version 4 rather than silently dropping photos.
Undo snapshots contain image references, share immutable image strings, and retain
at most 20 changes within a conservative 128 MiB history budget. The live project
is never dropped to meet that budget. Oversized local drafts are rejected before
serializing image payloads; download the project to save photo-heavy work.

Run `node tests/memory-browser.test.cjs` for editing/deletion/undo/redo and saved
project roundtrips. Set `TRACE_MEMORY_PROJECT` to a private project path for a real
file stress test; optional `TRACE_MEMORY_OUTPUT` writes the tested download.
Private fixtures must stay outside the repository.
