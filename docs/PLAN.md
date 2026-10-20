# Plan de Disco: MangoDisk + Bulk Crap Uninstaller

Estado: **propuesta pendiente de aprobación**. Este documento no autoriza todavía ningún cambio de código.

- Repo base: `C:\Dev\Disco`, fork de MangoDisk 1.1.9 (Tauri 2 + Rust + Vue, GPL-3.0-only).
- Fuente de funciones: `C:\Dev\BCU`, Bulk Crap Uninstaller 6.3 (C# .NET 8, Apache-2.0).
- Objetivo: una sola app, **Disco**, que conserve el análisis/limpieza de disco de MangoDisk y gane el desinstalador avanzado de BCU. **Windows primero.**

---

## 1. Cómo está organizado MangoDisk

| Pieza | Ubicación | Responsabilidad |
| --- | --- | --- |
| Frontend | `src/` (Vue 3 + TS estricto, Pinia, Tailwind 4, Shadcn-Vue) | Solo adaptador de interacción. `pages/<dominio>/` por pantalla (`application-uninstall`, `cleanup`, `analysis`, `large-files`, `duplicate-files`, `privacy`, `startup`, `system-optimization`, `system-maintenance`, `history`, `settings`, `tray-panel`…). `stores/` = estado por dominio; `lib/services/` = efectos (invocar Tauri, eventos); `lib/utils/` = funciones puras. Textos en `src/locales/*.json` (8 idiomas, **no hay español**). |
| Adaptador Tauri | `src-tauri/src/` | `commands/*.rs` validan entrada, llaman al Core y emiten eventos. Sin algoritmos. También bandeja (`resident/`), menú, updater, feedback. |
| Núcleo | `src-tauri/crates/mangodisk-core` | Dominios neutrales de plataforma: `cleanup` (reglas TOML en `rules/`), `storage` (`analysis`, `large_files`, `duplicates`, `index`, `traversal`), `applications` (`catalog`, `uninstall`, `leftovers`), `filesystem`, `history`, `reporting`, `privacy`, `startup`, `system_*`, `ai`. No depende de Tauri. |
| Plataforma | `src-tauri/crates/mangodisk-platform` | Contratos (`src/contracts/*.rs`) e implementaciones `windows/`, `macos/`, `linux/`. Reporta hechos y capacidades; no decide flujos. Incluye el **broker de elevación** (`elevation.rs`): pide UAC una vez por proceso y lanza solo capacidades fijas (`maintenance`, `system_settings`, `startup`, `disk_cleanup`, `registration_removal`, `application_uninstall`), nunca comandos arbitrarios. |
| Proceso privilegiado | `src-tauri/crates/mangodisk-privileged` + `mangodisk-privileged-protocol` | `MangoDiskPrivileged.exe`: **servicio de Windows** instalado aparte, que expone por *named pipe* solo hechos de lectura (salud y temperatura de CPU vía driver PawnIO). Lo compila y copia a `src-tauri/resources/privileged/` el script `scripts/build-privileged.mjs`; en release exige firma Authenticode válida. **No participa en la desinstalación**: la elevación de desinstalaciones va por el broker de `mangodisk-platform`. |
| CLI | `src-tauri/crates/mangodisk-cli` (binario `mangodisk`) | Adaptador hermano sobre el Core. Hoy solo tiene `clean` (escaneo de solo lectura; `--apply`, `--dry-run`, `--yes`, `--selection`, `--format human|json|jsonl`). No expone desinstalación. |
| Herramientas | `src-tauri/xtask`, `scripts/*.mjs` | Benchmarks, baselines y comprobaciones (`check:identity`, `check:i18n`, `check:source-architecture`…). |

Reglas clave de `AGENTS.md` que condicionan la integración: dry-run y preflight siempre, rutas protegidas, manejo de *reparse points*, confirmación explícita, verificación posterior, tipos/códigos estables entre procesos (nada de inferir por mensajes libres), esquemas versionados, no editar código de terceros para cambiar comportamiento global, comentarios de código en inglés.

## 2. El desinstalador actual de MangoDisk (Windows)

**Detección** (`mangodisk-platform/src/windows/inventory.rs`, `package_sources.rs`, `package_reconciliation.rs`): claves `Uninstall` de HKLM/HKCU en vistas 32/64 bits, productos MSI (`MsiEnumProductsExW`), paquetes AppX, alias de WinGet, Steam (lee bibliotecas sin lanzar Steam), Scoop y Chocolatey. Reconcilia duplicados entre fuentes, calcula tamaño con `EstimatedSize` y marca `system_signed`. Cada app tiene un `catalog_identifier` estable.

**Desinstalación** (`windows/native_uninstall.rs` + `core/applications/uninstall/`): construye un *plan* tipado (`ApplicationUninstallRegistration`: `WindowsMsi`, `WindowsAppx`, `WindowsScoop`, `WindowsChocolatey`, `WindowsRegistered`). El comando registrado no cruza la frontera: se guarda un *digest* y en ejecución se reabre la clave y se comprueba que no cambió. MSI vía `MsiConfigureProductExW`; EXE vía Shell para respetar su manifiesto UAC; sin `cmd.exe`; espera al árbol de procesos; verificación posterior (`RemovalUnconfirmed`, `NativeFailureAfterRemoval`…). Lotes de hasta 128 apps (`batch.rs`), **secuenciales e interactivos**: se abre el asistente del fabricante. No usa `QuietUninstallString` ni genera modos silenciosos.

**Restos**: en Windows **no hay limpieza de restos**. `applications/leftovers` solo está implementado para macOS (`#[cfg(target_os = "macos")]`); en Windows el escaneo devuelve `supported = false`. Lo único que existe es `windows_observations.rs`, que registra hasta 4 carpetas relacionadas por app en `uninstall-observations.json` (solo como evidencia visible) y detecta **registros huérfanos** (`OrphanedRegistration`), que se pueden eliminar con `registration_removal`.

## 3. Bulk Crap Uninstaller

### 3.1 Funciones principales (librería `source/UninstallTools`)

- **Detección** (`Factory/ApplicationUninstallerFactory.cs`, 8 pasos): MSI, registro, **escaneo de unidades** (`DirectoryFactory`: encuentra apps **no registradas/portables** en Program Files y carpetas personalizadas y las marca `IsRegistered=false` / `IsOrphaned=true`), Store Apps, Steam, Oculus, Chocolatey, Scoop, Windows Features, Windows Updates, apps predefinidas y *scripts* (`ScriptFactory`, p. ej. quitar OneDrive). Asocia entradas de inicio a cada app. Rellena datos que faltan con *InfoAdders* (ubicación, tamaño —opcionalmente con `es.exe` de Everything—, iconos, 64 bits, **certificado**…).
- **Certificados** (`InfoAdders/CertificateGetter.cs`, `IsCertificateValid`): extrae el certificado de los primeros ejecutables, del almacén MSI o del desinstalador, y verifica la cadena.
- **Desinstalación en lote** (`Uninstaller/UninstallManager.cs`, `BulkUninstallTask.cs`): genera cadenas silenciosas para NSIS, Inno Setup, MSI y apps predefinidas; ejecuta varias a la vez; reintenta; mata desinstaladores atascados; `UninstallerAutomatizer.exe` pulsa los botones de asistentes "ruidosos"; modo simulación; desinstalación "simple delete" para apps sin desinstalador. 14 tipos (`UninstallerType`).
- **Restos** (`Junk/`): ~20 buscadores (carpetas de instalación/desinstalador, AppData, accesos directos, Prefetch, WER, inicio, COM, reglas de firewall, event log, UserAssist, AppCompat, claves `Software`, etc.). Cada resultado tiene una **confianza** acumulada (`Unknown 0 → Bad 5 → Questionable 7 → Good 9 → VeryGood 12`) y comprueba si la carpeta la usa otra app. Excluye carpetas especiales y la propia ubicación de BCU. Borra archivos a la **Papelera** y claves de registro (con copia `.reg` opcional vía `Backup`).
- **Huérfanos de Program Files** (`Junk/ProgramFilesOrphans.cs`): carpetas que no pertenecen a ninguna app instalada.
- **Listas de desinstalación** (`Lists/UninstallList.cs`, `.bcul`): filtros XML (nombre, editor, etc.) para repetir una desinstalación masiva.
- Otros: gestor de inicio, notas, caché de información, puntos de restauración (solo en la GUI WinForms).

### 3.2 BCU-console (`source/BCU-console/Program.cs`)

| Comando | Qué hace | Salida |
| --- | --- | --- |
| `list [/Q] [/U] [/V] [/F=json\|xml]` | Escanea apps | Tabla de texto; con `/F` documento JSON/XML **limpio en stdout** y progreso en stderr |
| `export <archivo> [/F=json\|xml]` | Igual, a archivo | XML por defecto o JSON |
| `uninstall <lista.bcul> [/Q] [/U] [/V] [/N] [/J=<nivel>]` | Desinstala las apps que casan con los filtros; `/Q` silencioso, `/U` desatendido, `/N` simulación, `/J` limpia restos ≥ nivel | **Solo texto** (contadores y `IJunkResult.ToString()`) |

JSON de `list`: `DisplayName, DisplayVersion, Publisher, Comment, AboutUrl, InstallLocation, InstallSource, InstallDate, EstimatedSizeKb, UninstallString, QuietUninstallString, UninstallerKind, UninstallerLocation, Is64Bit, IsProtected, IsRegistered, IsOrphaned, IsUpdate, IsValid, IsWebBrowser, SystemComponent, RegistryKeyName, RegistryPath, ParentKeyName, BundleProviderKey, QuietUninstallPossible, UninstallPossible`. Sin esquema versionado, sin ID estable, sin certificado, sin restos.

Códigos: `0` ok, `1` dry-run sin coincidencias, `1223` cancelado, `87` sintaxis (la ayuda dice `1`), `13` excepción.

**¿Sirve para usarlo desde otro programa?** Solo para **leer** (`list --format=json`). Para desinstalar y limpiar restos **no es adecuado**:

1. La selección es por filtros `.bcul`, no por ID: hay que escribir un archivo temporal y existe riesgo de falsos positivos.
2. Progreso y restos en texto libre: la UI tendría que inferir comportamiento de mensajes (prohibido por `AGENTS.md`).
3. Restos todo-o-nada por nivel de confianza: no se puede elegir elemento a elemento ni revisar antes.
4. **Fallo de seguridad**: tras desinstalar llama a `JunkManager.FindJunk(apps, apps, …)`, es decir, pasa solo las apps objetivo como "todas las apps". Las comprobaciones de "carpeta usada por otra app" y de nombres parecidos quedan desactivadas. La GUI pasa `allValidUninstallers` (`BulkCrapUninstaller/Functions/AppUninstaller.cs:353`).
5. Sin `/U` usa `Console.ReadKey`, que lanza excepción con stdin redirigido.
6. La librería puede abrir **diálogos WinForms** de error (`PremadeDialogs.GenericError`, 17 usos en `UninstallTools`), que bloquearían un proceso sin ventana.
7. Sin cancelación cooperativa (solo matar el proceso) ni búsqueda de huérfanos de Program Files.

Comprobado en este equipo: compila con `MSBuild.exe` de Visual Studio 18 (el `dotnet build` del SDK falla con `MSB4803` por la referencia COM `Scripting`). Salida ≈ 28 MB *framework-dependent* (requiere .NET 8 Desktop Runtime). **No se pudo ejecutar** desde la carpeta temporal (Windows bloqueó el `.exe`); queda como tarea de la Fase 0.

## 4. Comparación función por función

| Función | MangoDisk | BCU | Mejor |
| --- | --- | --- | --- |
| Inventario por registro / MSI | Sí, con validación de identidad muy estricta | Sí | **MangoDisk** (seguridad) |
| AppX / Store | Sí | Sí | Empate |
| Steam / Scoop / Chocolatey / WinGet | Sí / Sí / Sí / Sí | Sí / Sí / Sí / No | MangoDisk (WinGet) |
| Oculus, Windows Features, Windows Updates | No | Sí | **BCU** |
| Apps no registradas / portables (escaneo de unidades) | No | Sí (`DirectoryFactory`) | **BCU** |
| Registros huérfanos (entrada sin archivos) | Sí, con eliminación del registro | Parcial (`IsValid`) | **MangoDisk** |
| Huérfanos en Program Files | No | Sí | **BCU** |
| Verificación de certificados | Solo `system_signed` | Sí, por app | **BCU** |
| Desinstalación individual | Sí, digest + revalidación + verificación posterior | Sí | **MangoDisk** |
| Desinstalación silenciosa | No | Sí (NSIS, Inno, MSI, predefinidas) | **BCU** |
| Lote en paralelo / automatizar asistentes | No (secuencial, interactivo) | Sí (`UninstallerAutomatizer`) | **BCU** |
| Desinstalar sin desinstalador ("forzado") | Solo quitar registro huérfano | Sí (simple delete) | **BCU** (con más riesgo) |
| Restos en Windows | **No implementado** | Sí, ~20 buscadores con confianza | **BCU** |
| Revisión elemento a elemento de restos | N/A en Windows (sí en macOS) | GUI sí, consola no | BCU-GUI |
| Listas reutilizables (`.bcul`) | No | Sí | **BCU** |
| Dry-run / preflight / confirmación | Sí, en todo flujo destructivo | Simulación en consola | **MangoDisk** |
| Historial de operaciones | Sí | No | **MangoDisk** |
| Elevación controlada | Broker de capacidades fijas | Ejecuta como admin completo | **MangoDisk** |
| Gestor de inicio | Sí | Sí | Empate |
| UI moderna, idiomas, bandeja | Sí (8 idiomas) | WinForms (24 idiomas) | **MangoDisk** |
| Análisis de disco, limpieza, duplicados, privacidad | Sí | No | **MangoDisk** |
| CLI con JSON | `clean` (json/jsonl) | `list/export/uninstall` (json solo en lista) | MangoDisk (calidad), BCU (alcance) |

Conclusión: MangoDisk aporta la arquitectura, la seguridad y la UI; BCU aporta **cobertura de detección, modo silencioso/lote y limpieza de restos en Windows**, justo lo que falta.

## 5. Opciones de integración

### (a) BCU-console como sidecar de Tauri

Empaquetar `BCU-console.exe` (+ `UninstallTools.dll`, `KlocTools.dll`, helpers) en `bundle.resources` y lanzarlo desde Rust.

- ✅ Cero código C# propio; rápido para un prototipo de **lectura** (`list --format=json`).
- ❌ Todos los problemas del §3.2: selección por `.bcul`, salida de texto, restos sin revisión, fallo de `FindJunk(apps, apps)`, posibles diálogos modales, sin cancelación.
- ❌ Arreglarlo exige parchear `Program.cs`, y entonces ya es la opción (b) mal hecha.

### (b) Helper propio en .NET que usa las librerías de BCU y devuelve JSON — **recomendada**

Nuevo proyecto pequeño, p. ej. `helpers/disco-bcu-helper/` (C#, consola), que referencia `UninstallTools` desde una copia fijada de BCU (submódulo o *subtree* en `third_party/bcu/` en un commit concreto). Rust lo lanza con ruta fija (como `MangoDiskPrivileged.exe`, **sin** `tauri-plugin-shell`, para no exponerlo al frontend).

Protocolo: **JSON Lines versionado** por stdin/stdout, una petición por proceso o sesión corta:

- `inventory` → apps con ID estable, origen, `isRegistered`, `isOrphaned`, certificado (sujeto, válido sí/no), tipo de desinstalador, `quietAvailable`.
- `junk.scan { appIds[] }` → candidatos con ID, tipo (archivo/carpeta/clave/valor/inicio), ruta, **nivel y motivos de confianza**, pasando **todas** las apps instaladas como contexto (requisito S1, §8).
- `orphans.scan` → huérfanos de Program Files.
- `uninstall.run { appId, quiet }` → ejecuta un solo desinstalador y emite eventos `progress`/`result` con códigos estables.
- Cada mensaje lleva `schemaVersion`; Rust rechaza versiones desconocidas.

Reparto de responsabilidades:

- **Helper (C#)**: solo detecta, puntúa y ejecuta el desinstalador del fabricante. Configura `UninstallToolsGlobalConfig` sin UI y captura excepciones para que nunca aparezca un diálogo.
- **Rust Core**: plan, dry-run, confirmación, lote, cancelación, historial y **verificación posterior con su propio inventario**. Los **borrados de restos los hace Rust** con las primitivas existentes de `filesystem` (rutas protegidas, *reparse points*, preflight), más una primitiva nueva de borrado de registro con copia `.reg` previa. Así BCU propone y Disco decide.

- ✅ Reutiliza años de heurísticas de BCU sin reescribirlas; salida tipada; mantiene todas las invariantes de seguridad de MangoDisk.
- ✅ La parte .NET queda aislada y es reemplazable pieza a pieza por la opción (c).
- ❌ Dependencia de .NET: **.NET 8 termina su soporte el 10-nov-2026**. Se recompila `UninstallTools` para **.NET 10 LTS**, dependiente del runtime (ver §9). .NET Framework 4.8 no es viable sin retroportar BCU.
- ❌ Compilación con MSBuild de Visual Studio (referencia COM) y un segundo toolchain en CI.
- ❌ El helper necesita elevación para HKLM y desinstalaciones de máquina: hay que añadir una capacidad fija `bcu_helper` al broker, verificando el hash/firma del helper.

### (c) Portar partes a Rust

Reescribir en `mangodisk-platform/src/windows/` y `core/applications/leftovers/windows.rs` los buscadores de restos, el escaneo de unidades y los generadores de cadenas silenciosas.

- ✅ Un solo lenguaje y binario, sin runtime .NET, sin proceso extra, máxima coherencia con el código actual.
- ❌ Mucho trabajo (decenas de buscadores, casos especiales de instaladores) y riesgo de regresiones en heurísticas probadas durante años.
- ⚠️ Un port línea a línea es obra derivada de BCU: se mantiene la atribución Apache-2.0 (ver §6).

### Recomendación

**(b) como camino principal, con (a) solo como prueba rápida en la Fase 0 y (c) como evolución gradual**: cuando una pieza del helper esté bien cubierta por pruebas (p. ej. generadores de cadenas silenciosas, buscadores de AppData), se puede portar a Rust y retirarla del helper. Así se obtiene valor pronto sin sacrificar la seguridad.

## 6. Licencias

- MangoDisk es **GPL-3.0-only** y BCU es **Apache-2.0**. La FSF considera Apache-2.0 **compatible con GPLv3** (en ese sentido: código Apache puede formar parte de una obra GPLv3). El conjunto Disco puede distribuirse bajo **GPL-3.0-only**. Además, el helper es un proceso aparte comunicado por JSON, lo que facilita la separación.
- `source/ObjectListView` (dentro de BCU) es **GPLv3**: compatible. Solo lo necesita la UI de `UninstallTools`; el helper no debería cargarlo.
- `NBug_custom` es **MIT** (solo GUI de BCU; no incluirlo).
- `es.exe` (Everything CLI de voidtools): **licencia por verificar**; no redistribuirlo hasta confirmarla. El helper puede funcionar sin él.

Avisos que hay que conservar (Apache-2.0 §4):

1. Incluir el texto de la licencia Apache-2.0 (`C:\Dev\BCU\Licence.txt`) → `third_party/bcu/LICENSE` y en el instalador.
2. Conservar las cabeceras `Copyright (c) … Marcin Szeniak (https://github.com/Klocman/) Apache License Version 2.0` de todos los archivos copiados o portados.
3. Marcar de forma visible los archivos de BCU que modifiquemos (p. ej. `// Modified for Disco: …`).
4. Reproducir el contenido de `NOTICE` de BCU en un `NOTICE`/`THIRD-PARTY-NOTICES` de Disco y en la pantalla "Acerca de / licencias".
5. No usar el nombre "Bulk Crap Uninstaller" ni su logo para promocionar Disco (§6 marcas); sí se puede decir "usa componentes de BCU".

Por la GPLv3 de MangoDisk (§5): mantener los avisos de copyright de harry0703, indicar que Disco es una versión modificada con fecha, ofrecer el código fuente y conservar `LICENSE`.

## 7. Renombrado a Disco

Hay unas **3.000 apariciones de "mangodisk" en ~460 archivos**. Se separa en dos niveles para que el *Review* sea claro (regla 4 del flujo):

**Nivel 1 – identidad visible (Fase 1):**

- `package.json`: `name`, `author`, `homepage`, `repository`, `bugs`.
- `Cargo.toml` (workspace): `authors`, `repository`, `homepage`.
- `src-tauri/tauri.conf.json`: `productName` → `Disco`, `identifier` → p. ej. `io.github.nikporras.disco`, `mainBinaryName`, `app.windows[0].title`, `bundle.publisher`, `homepage`, `copyright`; **updater**: endpoints `mangodisk.app` y `pubkey` (desactivar el updater hasta tener servidor y clave propios).
- `tauri.windows.conf.json` / `tauri.macos.conf.json` / `tauri.linux.conf.json` y `src-tauri/nsis/installer-hooks.nsh`.
- `src-tauri/crates/mangodisk-core/src/lib.rs`: `APPLICATION_IDENTIFIER`.
- `index.html`, `src-tauri/src/lib.rs` (textos "MangoDisk"), locales (`src/locales/**`), `native_labels.rs`.
- Iconos: `public/mangodisk.png|svg`, `src/components/icons/md-icon-mangodisk.vue`, `src-tauri/icons/**`, imágenes NSIS.
- Servicios remotos de MangoDisk: feedback (`src-tauri/src/services/feedback.rs`), IA gratuita oficial, enlaces a `mangodisk.app` y `assets.mangodisk.app` → desactivar o apuntar a servicios propios.
- README(s): reescribir para Disco con atribución a MangoDisk y BCU.
- **`scripts/check-product-identity.mjs`**: actualizar los valores esperados (`name`, `productName`, `identifier`, `mainBinaryName`, título, `APPLICATION_IDENTIFIER`, nombres de paquete/binario del CLI, rutas de icono, `README` con el comando CLI, `index.html`, `lib.rs`, la identidad del monitor de macOS `app.mangodisk.cache-dirty-monitor`). Se cambia **en el mismo commit** que los valores, para que `pnpm check:identity` siga pasando.

**Nivel 2 – identidad interna (fase posterior, opcional):**

- Crates `mangodisk-*` → `disco-*` (imports `mangodisk_core`, `mangodisk_platform`… ~900 usos), binario CLI `mangodisk` → `disco`, `mangodisk_lib`.
- `MangoDiskPrivileged.exe`, nombre del servicio y *named pipe*, tareas programadas (`MANGODISK_MAINTENANCE_TASK`), `MangoDiskTaskbarStatus`, `MangoDiskShellIcon`.
- Variables `MANGODISK_*`, `mangodisk-rule-validation.bin`, prefijos de archivos temporales.
- Prefijo `md-` de componentes (lo impone `check-source-architecture.mjs`): se puede mantener.

Al cambiar `identifier`, la carpeta de datos cambia: Disco empezará sin historial ni ajustes de MangoDisk (es lo deseable para un producto distinto; no hace falta migración). Cambiar el nombre del servicio privilegiado requiere que el instalador desinstale el antiguo si existiera.

## 8. Fases

Cada fase es pequeña, se prueba sola y termina con `pnpm check` + `cargo test -p mangodisk-core` verdes en Windows. macOS/Linux: se compila pero no se valida; se indica en cada commit.

Flujo de trabajo: cada fase en su propia rama (`fase-N-<tema>`, creada desde `main`), con commit al terminar cuyo mensaje incluye un resumen de **qué probar**. La rama se integra en `main` solo tras la aprobación del usuario.

### Requisitos de seguridad transversales

- **S1 — Restos contra todas las apps.** El helper debe pasar a `JunkManager.FindJunk` (y a `ProgramFilesOrphans.Setup`) **la lista completa de programas instalados**, nunca solo los que se van a desinstalar. Así funcionan las comprobaciones de "carpeta usada por otra app" y de nombres parecidos. BCU-console tiene este fallo (`FindJunk(apps, apps, …)`); el helper no lo debe repetir. Además, Rust vuelve a comprobar cada candidato contra su propio inventario antes de borrar. Hace falta un test que lo demuestre: dos apps de prueba que comparten carpeta → la carpeta compartida no puede salir como resto con confianza alta.
- **S2 — Sin actualizaciones ni servicios de MangoDisk.** Disco nunca debe descargar ni instalar una actualización de MangoDisk ni enviar datos a `mangodisk.app`. Se desactiva en la Fase 0 y `check:identity` lo vigila desde la Fase 1.
- **S3 — Solo programas de prueba propios.** Las pruebas de desinstalación y limpieza de restos usan exclusivamente programas pequeños creados para el test (instaladores NSIS/Inno/MSI mínimos generados por un script del repo), instalados en VM o Windows Sandbox. Nunca se desinstala software real.

### Fase 0 — Línea base y corte con mangodisk.app
- Verificar que Disco compila y pasa `pnpm check` en Windows tal cual.
- **S2**: desactivar el actualizador de Tauri (sin endpoints ni clave de MangoDisk) y los servicios remotos de `mangodisk.app` (feedback, explicaciones de IA oficiales, descargas). Es el único cambio de código de esta fase.
- Ejecutar BCU-console `list --format=json` desde una carpeta permitida y medir tiempo/número de apps (sin guardar el informe en el repo).
- Comprobar que `UninstallTools` compila **y funciona** con **.NET 10**.
- **Prueba**: `pnpm check`; la app arranca y no hace ninguna petición a `mangodisk.app`.

**Resultados (18-oct-2026, Windows 11 Pro x64, equipo de desarrollo):**

- `main` sin cambios pasa `pnpm check`: 215 archivos / 1.840 tests de frontend y 896 tests de Rust correctos.
- Todos los ejecutables de BCU llevan `requireAdministrator` en `source/app.manifest`: sin UAC no arrancan ("The requested operation requires elevation"). El helper de Disco debe usar su propio manifiesto `asInvoker` y elevarse solo a través del broker (Fase 6).
- `BCU-console list --format=json` (compilado con manifiesto `asInvoker`, solo lectura): .NET 8 → 1.115 apps en ~57 s; .NET 10 → 1.098 apps en ~65 s. La diferencia son exactamente las 17 *Windows Features*.
- Causa: `KlocTools/IO/WmiQueries.cs` usa `EnumerationOptions` con `Rewindable = false` y luego `Cast<ManagementObject>().ToList()`. En .NET 10, LINQ lee antes `Count`, que consume la enumeración no rebobinable, y la lista queda vacía (comprobado con un programa mínimo: 0 resultados en .NET 10 y 136 en .NET 8; con `Rewindable = true`, 136 en ambos). Las demás consultas WMI de BCU usan opciones por defecto (rebobinables) y no están afectadas.
- Conclusión: **.NET 10 es viable con un parche de una línea** (`Rewindable = true`) en la copia fijada de BCU, documentado y propuesto *upstream*.
- Compilar BCU requiere el MSBuild de Visual Studio (referencia COM `Scripting`); `dotnet build` falla con `MSB4803`.

### Fase 0b — Superficie mínima (antes del renombrado)
Motivo: Bitdefender marcó `MangoDisk.exe` por comportamiento tras la prueba de la Fase 0, y después puso en cuarentena el ejecutable y bloqueó la escritura de `MangoDiskPrivileged.exe`. La auditoría no encontró código malicioso, pero sí técnicas legítimas que los antivirus asocian con malware. Rama `fase-0b-superficie-minima`.
- **Barra de tareas eliminada por completo**: código (`src-tauri/src/resident/taskbar_display`), DLL C++ (`src-tauri/windows/taskbar`), su compilación en `build.rs` (dependencia `cc`) y su carga en Explorer (`InitializeXamlDiagnosticsEx`). Las métricas se ven solo en el área de notificación. Los campos `taskbarPosition`/`taskbarBackground` se conservan en el esquema de preferencias guardadas por compatibilidad, sin interfaz.
- **PawnIO y servicio privilegiado de temperatura fuera del build por defecto** con el feature `hardware-sensors` (en `mangodisk`, `mangodisk-platform` y `mangodisk-privileged`). Sin él, el binario `MangoDiskPrivileged.exe` (que incrusta `PawnIO_setup.exe`) no se compila, `build-privileged.mjs` no hace nada y la app informa del sensor como no compatible. El código se conserva para la fase de sensores. Para activarlo: `DISCO_HARDWARE_SENSORS=1` + `--features hardware-sensors`.
- **Arranque automático y PowerShell elevado** solo como acciones explícitas (interruptor de Ajustes / botón de una tarea de mantenimiento). Ya era así; se añaden tests que lo vigilan.
- **Privacidad de navegadores desactivada por defecto**: `PrivacyScanRequest.includeBrowsers` (por defecto `false` en Core y en la interfaz, no se recuerda entre sesiones). Sin activarlo no se abre ninguna base de datos de navegador.
- **Solo totales** para cookies, contraseñas guardadas, autocompletado y búsquedas: "Ver detalles" no consulta sus bases de datos (ni sitios ni nombres de campo). El resto de detalles (historial, descargas…) se lee solo con el navegador cerrado.
- **Sin copias a `%TEMP%`**: se eliminó la instantánea de bases de datos bloqueadas. Con el navegador abierto no se lee su base de datos; el elemento queda como "Escanear después de cerrar", con un aviso que nombra los navegadores abiertos, y los detalles responden `browserRunning` con un mensaje claro.
- **Tráfico de red solo en memoria**: Bitdefender puso en cuarentena varias veces `%APPDATA%\app.mangodisk.desktop\network-traffic.json` con la app abierta. El archivo solo contenía el GUID del adaptador, los bytes acumulados y la fecha de inicio, y se reemplazaba cada minuto mediante un archivo temporal y un renombrado. Ahora los totales duran la sesión y no se escriben en disco; al arrancar se borran `network-traffic.json` y `network-traffic.lock` de versiones anteriores. No se obtuvo el nombre de la detección.
- Tests de guarda en `src-tauri/src/surface_tests.rs`: ninguna API de inyección en procesos, `build.rs` sin código nativo, sensores opcionales, arranque automático solo desde su comando.
- **Prueba**: `pnpm check`; compilar y comprobar que Bitdefender ya no lo marca; Explorer sin `xaml-*.dll` de Disco.

### Fase 1 — Renombrado visible a Disco
- Nivel 1 del §7 con el identificador `io.github.nikporras.disco` y `check:identity` actualizado (incluye comprobar que no hay endpoints de `mangodisk.app`).
- Añadir `NOTICE` / `THIRD-PARTY-NOTICES` con MangoDisk (GPL) y BCU (Apache, aunque aún no se use).
- **Prueba**: `pnpm check:identity`, `pnpm check`, abrir la app y ver "Disco".

### Fase 2 — Esqueleto del helper .NET (solo lectura)
- `third_party/bcu` fijado a un commit; proyecto `helpers/disco-bcu-helper` (.NET 10, manifiesto `asInvoker`) con comando `inventory` y JSON versionado; script `scripts/build-bcu-helper.mjs` que lo compila y copia a `src-tauri/resources/bcu/`.
- Parche mínimo y marcado a BCU: `Rewindable = true` en `WmiQueries.GetWindowsFeatures` (ver resultados de la Fase 0). Test: el inventario incluye Windows Features.
- **Prueba**: tests del helper (salida válida, sin diálogos, códigos de salida) y ejecución manual.

### Fase 3 — Cliente Rust e inventario combinado
- Contrato en `mangodisk-platform` (Windows) que lanza el helper con ruta fija, timeout, límite de tamaño y validación de esquema; `cfg(windows)`.
- El catálogo añade las apps **no registradas/portables** y el estado del **certificado** como evidencia visible (no como autorización de borrado). Si el helper falta o falla → catálogo actual de MangoDisk (fallback seguro, registrado en log).
- **Prueba**: tests de parseo/versión en Core, prueba manual de la página de desinstalación.

### Fase 4 — Escaneo de restos en Windows (dry-run)
- `junk.scan` y `orphans.scan` en el helper; `applications/leftovers` acepta candidatos de Windows con confianza y motivos; UI de revisión elemento a elemento. **Nada se borra todavía.**
- **Prueba**: tests de mapeo y de que las rutas protegidas se descartan; comparación manual con la GUI de BCU en una app de prueba.

### Fase 5 — Borrado de restos
- Rust borra archivos/carpetas con las primitivas existentes y claves de registro con una primitiva nueva que exporta `.reg` antes; preflight, confirmación, historial, verificación. Selección por defecto solo `VeryGood`.
- **Prueba**: tests de seguridad (reparse points, rutas protegidas, clave cambiada) y prueba en VM con un programa de prueba propio (S3), incluido el caso de carpeta compartida (S1).

### Fase 6 — Desinstalación silenciosa
- `uninstall.run { quiet: true }` para apps con modo silencioso fiable (MSI, NSIS, Inno); opción explícita en la UI; verificación posterior con el inventario de Disco; capacidad `bcu_helper` en el broker de elevación.
- **Steam y otros *launchers***: fallo observado el 19-oct-2026 con Chivalry 2 (Steam). MangoDisk abrió el diálogo de Steam y casi enseguida mostró "Uninstall did not finish completely", mientras Steam seguía esperando confirmación; Steam terminó de borrarlo después. El desinstalador del juego (`steam://uninstall/<appid>`) delega en el proceso de Steam y termina enseguida, así que esperar a ese proceso no basta. Referencia en BCU: `SteamHelper/SteamUninstaller.cs`. En modo normal lanza `steam://uninstall` y **espera mientras exista `appmanifest_<appid>.acf`**, con opción de cancelar. En modo silencioso **mata Steam y borra las carpetas** directamente; Disco no debe copiar eso, porque los borrados los decide el Core de Rust y cerrar Steam requiere confirmación. Disco debe esperar a que el *launcher* termine de verdad (desaparece el manifiesto y luego se verifica la carpeta del juego) antes de verificar y dar el resultado. Mientras tanto, mostrar "esperando a Steam" en lugar de un fallo. Revisar también Epic, GOG, EA y Ubisoft (`UninstallTools/Factory`).
- **Prueba**: VM con instaladores NSIS/Inno/MSI de prueba.

### Fase 7 — Lote en paralelo y automatizador
- Varias desinstalaciones silenciosas a la vez con límite; `UninstallerAutomatizer` opcional para asistentes ruidosos.
- **Prueba**: VM, lote de 5+ apps, cancelación a mitad.

### Fase 8 — Listas de desinstalación y CLI
- Importar/exportar `.bcul` (o formato propio JSON) para repetir lotes; subcomandos `apps list` y `apps uninstall --dry-run` en el CLI.
- **Prueba**: tests del CLI y del parser de listas.

### Fase 9 — Extras y port progresivo
- Windows Features/Updates, Oculus, locale `es-ES`, renombrado interno (Nivel 2) y port a Rust de las piezas del helper más estables.

### Fase 10 — Sensores de hardware y monitor de sistema (pendiente de diseño)
- Recuperar la temperatura de CPU y otros sensores, probablemente con LibreHardwareMonitor (revisar antes su licencia, MPL-2.0, y cómo carga su driver). Partir del código conservado tras el feature `hardware-sensors` o sustituir PawnIO.
- Siempre opcional y con instalación explícita del usuario; nunca en el build por defecto hasta tener la firma de código de la Fase 11.
- **Rediseñar el monitor de red** (la opción C de la investigación de `network-traffic.json`): replantear el monitor heredado de MangoDisk dentro de funciones tipo Administrador de tareas (procesos, CPU, memoria, disco, red). Cualquier dato por proceso o por conexión debe ser opcional, mostrarse solo en memoria y no guardarse en disco sin una decisión explícita de privacidad.

### Fase 11 — Distribución
- **Firma de código** de todos los ejecutables que se publiquen (`Disco.exe`, instalador NSIS, helper .NET y, si existe, el helper privilegiado), por ejemplo con **SignPath Foundation** (firma gratuita para proyectos open source, con compilación en CI verificable). `build-privileged.mjs` ya exige Authenticode válido en release; extender la misma comprobación al resto.
- Empaquetado del runtime .NET 10 del helper (dependiente del runtime o autocontenido).
- Decidir si Disco tendrá servidor de actualizaciones propio (clave y endpoints nuevos; nunca los de MangoDisk).
- Enviar los binarios firmados a los fabricantes de antivirus (Bitdefender, Microsoft Defender) si siguen apareciendo falsos positivos.

## 9. Riesgos y decisiones pendientes

- **Runtime .NET** (decidido: **.NET 10, dependiente del runtime** por ahora; el empaquetado se decide en la fase de distribución, Fase 11). Motivo: todos los proyectos de BCU (`UninstallTools`, `KlocTools`, `ObjectListView`, helpers) heredan `net8.0-windows10.0.18362.0` de `source/Directory.Build.props`; ninguno es .NET Framework 4.x (eso era la rama `legacy-4.x`). En una copia aparte, `UninstallTools` compila con `net10.0-windows10.0.18362.0` sin errores, mientras que con `net48` ni siquiera pasan sus dependencias (`IsExternalInit`, `GeneratedRegex`, `Rune`, diseñadores WinForms) y después vendrían WinRT (`Windows.Management.Deployment`), `System.Text.Json`, `DistinctBy`, `Enum.GetValues<T>`… Usar 4.8 obligaría a mantener un fork retroportado de BCU. En la Fase 0 se encontró una única incompatibilidad en tiempo de ejecución con .NET 10 (Windows Features vacías por una enumeración WMI no rebobinable), corregible con un parche de una línea.
- **Identificador**: `io.github.nikporras.disco` (decidido). Pendiente: si habrá servidor de actualizaciones propio.
- **Parches a BCU**: si hace falta cambiar `UninstallTools` (p. ej. quitar diálogos), mantenerlos mínimos, marcados y, si es posible, enviarlos *upstream*.
- **Anotado para más adelante** (sin fase asignada; revisar al tocar Privacidad):
  - La recomendación inteligente deja marcado el historial de navegación como "Low risk". Debería quedar desmarcado por defecto.
  - El diálogo de "Ver detalles" cuando solo hay un total ocupa el tamaño grande para una sola línea de texto. Debería ser más pequeño.
- **Pruebas destructivas** solo en VM o *Windows Sandbox*, nunca en el equipo de desarrollo, y solo con programas de prueba propios (S3).
