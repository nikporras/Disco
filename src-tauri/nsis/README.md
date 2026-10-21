# Windows installer hooks

`installer-hooks.nsh` only right-aligns the compact Disco mark in the installer
and uninstaller header bitmaps (`MUI_HEADERIMAGE_RIGHT`).

MangoDisk's publisher-migration hook, which restored installation directories
recorded under its historical publisher registry keys during automatic updates,
is intentionally not inherited. Disco has its own identifier, publisher and
data directory, has no release channel yet, and never takes over a MangoDisk
installation.
