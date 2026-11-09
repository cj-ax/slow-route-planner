# Data sources, licenses, attribution

All data is fetched at runtime from the publisher's public service. Nothing is redistributed in this repo
except the Open Sans glyph range (`client/public/fonts`, Apache 2.0, via MapLibre demotiles).

| Data | Service | License / terms | Attribution |
|---|---|---|---|
| USGS Topo, Imagery basemaps | basemap.nationalmap.gov | Public domain (USGS) | USGS The National Map |
| NAIP imagery | imagery.nationalmap.gov USGSNAIPImagery ImageServer | Public domain (USDA FSA) | USDA NAIP via USGS |
| 3DEP hillshade | elevation.nationalmap.gov 3DEPElevation ImageServer | Public domain | USGS 3D Elevation Program |
| PAD-US (Public Access) | services.arcgis.com/v01gqwM5QqNysAAi PADUS_Public_Access | Public domain (USGS GAP) | USGS Gap Analysis Project, PAD-US |
| MN DNR WMA boundaries (publicly accessible) | enterprise.gisdata.mn.gov us_mn_state_dnr/bdry_dnr_wildlife_mgmt_areas_pub | MN public data, Minnesota Geospatial Commons terms | MN DNR via MnGeo |
| MN DNR WMA public facilities (parking) | enterprise.gisdata.mn.gov us_mn_state_dnr/struc_dnr_wld_mgmt_areas_pub | as above | MN DNR via MnGeo |
| Cropland Data Layer 2025 (MN) | enterprise.gisdata.mn.gov us_mn_state_mda/agri_cropland_data_layer_2025 | Public domain (USDA NASS) | USDA NASS CDL, hosted by MN Dept. of Agriculture / MnGeo |
| NLCD 2021 land cover | www.mrlc.gov GeoServer WMS | Public domain | MRLC consortium / USGS |
| NWI wetlands | fwspublicservices.wim.usgs.gov Wetlands MapServer | Public domain | U.S. Fish and Wildlife Service NWI |
| MapLibre GL JS | npm | BSD-3-Clause | MapLibre contributors |

Planned for the pipeline milestones (not used yet): OpenStreetMap via Geofabrik (ODbL 1.0,
"© OpenStreetMap contributors", share-alike applies to derived databases), NHD (public domain),
MN DNR deer permit areas, MnGeo parcels (context only, never implies hunting rights).
