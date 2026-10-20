# Disco

Disco es un fork de MangoDisk (Tauri 2 + Rust + Vue, GPL-3.0-only) que incorpora funciones del desinstalador Bulk Crap Uninstaller (C# .NET, Apache-2.0, copia local en `C:\Dev\BCU`). Objetivo: una sola app para analizar y limpiar el disco y desinstalar programas a fondo (detección de apps no registradas y huérfanas, desinstalación silenciosa en lote y limpieza de restos).

El plan completo, con fases, está en [`docs/PLAN.md`](docs/PLAN.md). Las reglas de arquitectura y seguridad de [`AGENTS.md`](AGENTS.md), [`src/AGENTS.md`](src/AGENTS.md) y [`src-tauri/AGENTS.md`](src-tauri/AGENTS.md) siguen vigentes y tienen prioridad en caso de duda.

## Reglas

- **Windows primero.** Implementa y valida en Windows; en macOS/Linux solo asegúrate de que compila y deja constancia de lo no validado.
- **Fases pequeñas.** Sigue el orden de `docs/PLAN.md`. Cada fase debe poder probarse sola y dejar `pnpm check` en verde. No empieces una fase sin aprobación del usuario.
- **No copiar código de WinDirStat**, ni de ningún otro proyecto cuya licencia no se haya revisado. Código de BCU solo con su atribución Apache-2.0 (cabeceras, `NOTICE`, archivos modificados marcados).
- **Explicar en español** al usuario: planes, resúmenes y descripciones. Los comentarios de código, logs, nombres y tests siguen en inglés, como exige `AGENTS.md`.
- La seguridad no se negocia: dry-run, preflight, rutas protegidas, *reparse points*, confirmación explícita, verificación posterior e historial en todo flujo destructivo. BCU **propone** candidatos; el Core de Rust **decide y ejecuta** los borrados.
- Las búsquedas de restos se comparan siempre contra **todos** los programas instalados, no solo los que se desinstalan (requisito S1).
- Disco nunca se actualiza a MangoDisk ni llama a servicios de `mangodisk.app` (requisito S2).
- Las pruebas destructivas (desinstalar, borrar restos) usan solo programas de prueba pequeños creados para el test, en una VM o Windows Sandbox, nunca en el equipo de desarrollo (requisito S3).
- Cada fase en su propia rama `fase-N-<tema>` desde `main`; commit al terminar con un resumen de qué probar. No integrar en `main` sin aprobación.
- Helper .NET: **.NET 10**, dependiente del runtime (empaquetado pendiente de la fase de distribución).
- No hacer `push` sin que el usuario lo pida.
- Al terminar cada fase, actualiza la sección **Estado actual** de este archivo en el mismo commit de la fase.
- Superficie mínima (Fase 0b): nada de inyectar código en otros procesos (Explorer incluido); PawnIO y el servicio privilegiado solo con el feature `hardware-sensors`; arranque automático y PowerShell elevado solo por acción explícita del usuario; navegadores fuera del escaneo de privacidad salvo que el usuario lo active. `src-tauri/src/surface_tests.rs` lo vigila.

## Estado actual

*Actualizado: 19-oct-2026, al cerrar la Fase 0b.*

**Fases terminadas**
- Fase 0 — Línea base y corte con mangodisk.app (rama `fase-0-linea-base`, commit `1433d13`). BCU apunta a .NET 8; el helper usará .NET 10 con un parche WMI de una línea.
- Fase 0b — Superficie mínima (rama `fase-0b-superficie-minima`, commits `81367de` y `bcaf42b`, creada encima de la Fase 0): sin barra de tareas ni inyección en Explorer, PawnIO detrás de `hardware-sensors`, navegadores fuera del escaneo de privacidad por defecto, solo totales para cookies/contraseñas/autocompletado/búsquedas y sin copias a `%TEMP%`.

**Ramas pendientes de integrar en `main`** (esperan aprobación del usuario)
- `fase-0-linea-base`
- `fase-0b-superficie-minima` (incluye la anterior; integrarla sola deja `main` con ambas)

**Probado a mano por el usuario (19-oct-2026)**: Bitdefender no marca ni el build ni el ejecutable (`C:\Dev` sin excluir); no se crea `taskbar-layout`; con Chrome abierto sale el aviso y los datos sensibles quedan en "Pending scan"; no hay `mangodisk-privacy-scan-*` en `%TEMP%`; el detalle de cookies muestra solo el total.

El aviso rediseñado de navegadores abiertos (commit `5d539a9`) está aprobado.

**Falta probar a mano**
- Tráfico de red solo en memoria: quitar la exclusión de Bitdefender para `%APPDATA%\app.mangodisk.desktop`, compilar con `pnpm tauri build --debug --no-bundle` y abrir `C:\Dev\Disco\target\debug\MangoDisk.exe`. Al arrancar deben desaparecer `network-traffic.json` y `network-traffic.lock` y no volver a crearse. El panel de red debe seguir mostrando los totales, y "Reset" debe ponerlos a cero.
- Sin validar: macOS/Linux y el build con `--features hardware-sensors`.

**Siguiente fase**: Fase 1 — Renombrado visible a Disco (identificador `io.github.nikporras.disco`, `check:identity` actualizado, `NOTICE`/`THIRD-PARTY-NOTICES`). Empieza solo tras aprobación y tras las pruebas manuales de arriba.

## Comandos

Requisitos en este equipo: Node 24 + pnpm 11, Rust 1.99 (`rust-toolchain.toml`), Visual Studio 18 (MSBuild) y SDK .NET 8/10.

```sh
pnpm install                       # dependencias del frontend
pnpm tauri dev                     # app en modo desarrollo
pnpm check                         # validación completa (frontend, identidad, Rust fmt/clippy/check/tests)
pnpm check:frontend                # solo frontend
pnpm check:identity                # identidad de producto (nombre, identificador, iconos)
cargo test --manifest-path src-tauri/Cargo.toml -p mangodisk-core   # tests del Core
pnpm rust:test                     # Core + proceso privilegiado
pnpm cli:build                     # CLI en release
pnpm tauri build                   # instalador NSIS (ejecuta pnpm build antes)
```

Sensores de hardware (PawnIO, desactivados por defecto): `DISCO_HARDWARE_SENSORS=1` para que `scripts/build-privileged.mjs` compile el helper, y `--features hardware-sensors` en el build de la app.

BCU (fuente de referencia, no se modifica). `dotnet build` falla por la referencia COM de `UninstallTools`; usa el MSBuild de Visual Studio:

```powershell
& "C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe" `
  C:\Dev\BCU\source\BCU-console\BCU-console.csproj -restore `
  -p:Configuration=Release -p:Platform=x64 -p:OutputPath=<carpeta de salida>\
<carpeta de salida>\BCU-console.exe list --format=json
```
