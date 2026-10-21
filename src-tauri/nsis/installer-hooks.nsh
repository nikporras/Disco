; Tauri's default NSIS template enables custom header images but leaves them
; aligned to the left. Disco's compact brand mark is intentionally placed in the
; bitmap's right-side safe area, so force right alignment on installer and
; uninstaller inner pages. Keeping this as a small hook avoids maintaining a fork
; of Tauri's complete installer template.
;
; MangoDisk's publisher-migration hook is intentionally not inherited: Disco has
; its own identifier and publisher and never takes over MangoDisk installations.
!define MUI_HEADERIMAGE_RIGHT
