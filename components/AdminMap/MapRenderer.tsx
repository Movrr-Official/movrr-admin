"use client";
import { forwardRef } from "react";
import Map, { type MapProps, type MapRef } from "react-map-gl/maplibre";

// v6 is ESM-only and requires an explicit same-origin worker under Next bundling.
const mapLib = import("maplibre-gl").then(library => {
  library.setWorkerUrl("/maplibre-gl-worker.mjs");
  return library;
});
const AdminMapRenderer = forwardRef<MapRef, MapProps>((props, ref) => <Map {...props} ref={ref} mapLib={mapLib} />);
AdminMapRenderer.displayName = "AdminMapRenderer";
export default AdminMapRenderer;
export * from "react-map-gl/maplibre";
