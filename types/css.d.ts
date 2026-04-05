/**
 * Allow TypeScript to resolve side-effect CSS imports such as
 *   import 'maplibre-gl/dist/maplibre-gl.css'
 * without requiring bundler-specific configuration.
 */
declare module "*.css" {}
