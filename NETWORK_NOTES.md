# Network notes (preflight, 2026-11-09)

## From GitHub Actions runner (preflight run 42576970738, success)
Runner: Ubuntu 26.04.1, 4 vCPU, 15 GiB RAM, 145 GB disk (88 GB free).

| host | http_code | time_s | reachable |
|---|---|---|---|
| apps.nationalmap.gov | 302 | 0.87 | yes |
| nassgeodata.gmu.edu | 302 | 0.47 | yes |
| www.mrlc.gov | 200 | 0.36 | yes |
| gisdata.mn.gov | 301 | 0.26 | yes |
| download.geofabrik.de | 200 | 0.90 | yes |
| s3.amazonaws.com | 307 | 0.16 | yes |
| basemap.nationalmap.gov | 200 | 0.35 | yes |
| elevation.nationalmap.gov | 200 | 0.20 | yes |
| services.arcgis.com | 200 | 0.10 | yes |
| fwspublicservices.wim.usgs.gov | 301 | 0.22 | yes |

## From this Claude Code session (HTTPS via agent proxy)

| host | result |
|---|---|
| apps.nationalmap.gov | 200 |
| nassgeodata.gmu.edu | **blocked** (000 over HTTPS) |
| www.mrlc.gov | 200 |
| gisdata.mn.gov | 301 |
| download.geofabrik.de | **blocked** (000) |
| s3.amazonaws.com | 307 |
| basemap.nationalmap.gov | 200 |
| elevation.nationalmap.gov | 200 |
| services.arcgis.com | 200 |
| enterprise.gisdata.mn.gov | 200 |
| imagery.nationalmap.gov | 200 |
| fwspublicservices.wim.usgs.gov | 200 |

## Browser-side services verified (CORS headers present for a github.io origin)
- USGS basemap tiles (USGSTopo, USGSImageryOnly): `access-control-allow-origin: *`
- USGS NAIP ImageServer exportImage: `*`
- USGS 3DEP ImageServer (Hillshade Gray raster function): 200
- PAD-US Public Access FeatureServer (services.arcgis.com/v01gqwM5QqNysAAi): `*`
- MnGeo enterprise.gisdata.mn.gov DNR + MDA services: origin echoed
- MRLC GeoServer WMS (NLCD): `*`
- USFWS NWI MapServer: origin echoed
- CDL: nassgeodata.gmu.edu not used in browser (no CORS confirmed, blocked here).
  Using MnGeo-hosted `agri_cropland_data_layer_2025` ImageServer instead.
