# System-surface icons

`public/disco.svg` is the vector source. It is a **placeholder** mark (a disc
with a highlighted sector) until Disco has final artwork; MangoDisk's mango logo
is not used. Regenerate the derived icons from the repository root with:

```sh
node scripts/generate-resident-icons.mjs
```

- `tray-template.png`: 36 px monochrome mask for macOS (the disc and its center
  hole). Tauri/AppKit renders it at 18 points and supplies the menu-bar color.
- `tray-color.png`: 64 px transparent color artwork for the system tray.
- `windows/icon.ico`: multiple native sizes for the Windows taskbar, executable
  and installer, selected by `tauri.windows.conf.json`. The largest entry is
  first because Tauri embeds that entry for live windows.

The application icons (`32x32.png`, `128x128*.png`, `icon.png`, `icon.ico`,
`icon.icns`) come from `pnpm tauri icon public/disco.svg`, and the NSIS
`installer-header.bmp` (150×57) and `installer-sidebar.bmp` (164×314) place
that icon on a white background. Do not edit the derived files by hand; change
the source or the generation steps instead. `public/disco.png` is a 512 px
raster of the same source for the HTML favicon.
