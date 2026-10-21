# Registro de sesiones

## 2026-10-21

**Integrado en `main`**: Fases 0, 0b, 1 y 2. La Fase 3 no ha empezado.

**`pnpm bcu:test`** (equipo de desarrollo, Windows 11, Bitdefender sin avisos): pasa. Lista 1.280 aplicaciones en 43 s, con entradas de Steam, de la Store y Windows Features; estas últimas confirman el parche WMI para .NET 10. Las ejecuciones anteriores tardaron entre 64 y 138 s.

**Hallazgos al revisar el inventario completo del helper**

- **Huérfanos peligrosos**: BCU marca como huérfanas carpetas en uso cuya "desinstalación" (`SimpleDelete`) es `del /F /S /Q` de toda la carpeta: `C:\Program Files\dotnet` (7,4 GB) y sus SDK `8.0.426` y `10.0.108`, `C:\Program Files\NVIDIA Corporation\NVIDIA app`, y juegos de Xbox (Grounded, Supermarket Simulator). Añadido al plan el requisito **S4**: nunca preseleccionarlos, comprobarlos contra todos los programas y las rutas protegidas, riesgo crítico con cuarentena obligatoria, y no ejecutar nunca ese `del`.
- **Tweaks**: los `Tweak-*` de ScriptHelper (Mouse Acceleration, Showing Desktop under This PC…) aparecen como aplicaciones. Irán fuera del catálogo.
- **Duplicados**: VulkanRT ×3, PowerToys ×2, Dropbox ×2, EA app ×2. Se agruparán mostrando en qué se diferencian.
- **UTF-8 correcto**: el helper escribe UTF-8 válido sin BOM ("God of War Ragnarök", "español (México)"). Los nombres rotos (`Ragnar├Âk`) solo aparecían en la consola de PowerShell, por la página de códigos 850. El cliente Rust leerá UTF-8 estricto.
- Los `uninstallString` de los auxiliares de BCU contienen la ruta de la carpeta de compilación (`C:\Dev\Disco\src-tauri\resources\bcu`); en la app instalada deben resolverse a la carpeta de recursos real.

**Pendientes**

- Fase 3 (cliente Rust del helper), con los requisitos de la revisión anotados en `docs/PLAN.md`:
  - UTF-8 estricto;
  - rutas de los auxiliares resueltas a la carpeta de recursos real;
  - filtros de sistema, actualizaciones y SDK/runtime;
  - tweaks fuera del catálogo;
  - duplicados agrupados;
  - huérfanos nunca preseleccionados;
  - log de `StoreAppHelper`;
  - .NET 10 Desktop Runtime;
  - inventario en segundo plano, cancelable y con caché.
- Fase 13 (distribución): cómo obtener BCU para compilar en CI u otro PC, firma de código y empaquetado del runtime de .NET.
- Sin validar: macOS/Linux y el build con `--features hardware-sensors`.
- Inventarios exportados (`inventario*.json`, `*.inventory.json`) ignorados por git; no se suben al repositorio.
