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
- Huérfanos y entradas `SimpleDelete` de BCU (requisito S4): nunca preseleccionados; antes de ofrecerlos, comprobar que no son carpeta, madre ni hija de ningún programa registrado ni de rutas protegidas (`Program Files\dotnet`, `WindowsApps`, NVIDIA, Steam, Xbox…); riesgo crítico con cuarentena obligatoria. Disco nunca ejecuta su `del /F /S /Q`.
- Disco nunca se actualiza a MangoDisk ni llama a servicios de `mangodisk.app` (requisito S2).
- Las pruebas destructivas (desinstalar, borrar restos) usan solo programas de prueba pequeños creados para el test, en una VM o Windows Sandbox, nunca en el equipo de desarrollo (requisito S3).
- Cada fase en su propia rama `fase-N-<tema>` desde `main`; commit al terminar con un resumen de qué probar. No integrar en `main` sin aprobación.
- Helper .NET: **.NET 10**, dependiente del runtime (empaquetado pendiente de la fase de distribución).
- No hacer `push` sin que el usuario lo pida.
- Al terminar cada fase, actualiza la sección **Estado actual** de este archivo en el mismo commit de la fase.
- Superficie mínima (Fase 0b): nada de inyectar código en otros procesos (Explorer incluido); PawnIO y el servicio privilegiado solo con el feature `hardware-sensors`; arranque automático y PowerShell elevado solo por acción explícita del usuario; navegadores fuera del escaneo de privacidad salvo que el usuario lo active. `src-tauri/src/surface_tests.rs` lo vigila.

## Estado actual

*Actualizado: 21-oct-2026, al cerrar la sesión. Resumen de la sesión en `docs/SESSION-LOG.md`.*

**Fases terminadas e integradas en `main`**
- Fase 0 — Línea base y corte con mangodisk.app.
- Fase 0b — Superficie mínima:
  - sin barra de tareas ni inyección en Explorer;
  - PawnIO detrás de `hardware-sensors`;
  - navegadores fuera del escaneo de privacidad por defecto, solo totales para cookies/contraseñas/autocompletado/búsquedas, sin copias a `%TEMP%` y con un aviso destacado si el navegador está abierto;
  - tráfico de red solo en memoria.
- Fase 1 — Renombrado visible a Disco: identificador `io.github.nikporras.disco`, `Disco.exe`, CLI `disco`, icono provisional, README/NOTICE y `check:identity` con S2. Los crates siguen llamándose `mangodisk-*` (Nivel 2).
- Fase 2 — Esqueleto del helper .NET: `disco-bcu-helper` (.NET 10, `asInvoker`, protocolo JSONL v1) con 4 parches mínimos a BCU. BCU no está en el repo: se usa una copia limpia externa fijada en `helpers/bcu/bcu.lock.json` (`C:\Dev\BCU`). Cómo obtenerla en CI u otro PC queda para la Fase 13.

Todo lo probó a mano el usuario entre el 19 y el 21 de octubre: Bitdefender no marca la app, Privacidad y el tráfico de red se comportan como se espera, la app muestra "Disco", y `pnpm bcu:build` y `pnpm bcu:test` pasan (1.280 aplicaciones con Steam, Store y Windows Features).

**Ramas pendientes de integrar en `main`**: ninguna.

**Falta probar a mano**: nada de las fases cerradas. Sin validar: macOS/Linux y el build con `--features hardware-sensors`.

**Plan actualizado**: requisitos de la Fase 3 y regla S4 de huérfanos añadidos a `docs/PLAN.md` tras revisar el inventario real.

**Pendiente para la Fase 3**: requisitos de la revisión del inventario en `docs/PLAN.md` (Fase 3 y S4): UTF-8 estricto, rutas del helper resueltas a la carpeta de recursos real, filtros (sistema, actualizaciones, SDK/runtime), tweaks fuera del catálogo, duplicados agrupados, huérfanos nunca preseleccionados, log de `StoreAppHelper`, .NET 10 Desktop Runtime e inventario en segundo plano con caché.

**Entorno**: Bitdefender tiene exclusiones para `C:\Dev\Disco`, `.cargo`, `.rustup` y pnpm, porque bloqueaba `dist`, `target` y las herramientas. Si vuelven a fallar los builds con "acceso denegado" o `LNK1104`, revisar el historial de Bitdefender.

**Siguiente paso**: empezar la Fase 3 — cliente Rust del helper BCU e inventario combinado (rama `fase-3-cliente-bcu`), cuando el usuario lo pida.

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

Helper BCU (Windows): `pnpm bcu:build` compila `helpers/disco-bcu-helper` contra una copia parcheada en `target/bcu-build` de la copia limpia de BCU (`DISCO_BCU_SOURCE`, `third_party/bcu` o `../BCU`, que debe estar en el commit de `helpers/bcu/bcu.lock.json`) y lo deja en `src-tauri/resources/bcu`. `pnpm bcu:test` comprueba el protocolo con un inventario real de solo lectura.

BCU (fuente de referencia, no se modifica). `dotnet build` falla por la referencia COM de `UninstallTools`; usa el MSBuild de Visual Studio:

```powershell
& "C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe" `
  C:\Dev\BCU\source\BCU-console\BCU-console.csproj -restore `
  -p:Configuration=Release -p:Platform=x64 -p:OutputPath=<carpeta de salida>\
<carpeta de salida>\BCU-console.exe list --format=json
```
