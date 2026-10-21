# Arquitectura

## Base elegida

- **Expo SDK 58, React Native 0.88 y TypeScript estricto:** base Android mantenida con módulos Expo compatibles por SDK.
- **Expo Router:** rutas basadas en archivos, incluidas en la plantilla oficial; se conserva una navegación mínima mientras solo existe Inicio.
- **expo-sqlite:** SQLite persistente en el dispositivo. La instalación usa `npx expo install` para resolver la versión compatible con SDK 58. No hay API ni inicio de sesión remoto.
- **Repositorios explícitos:** las consultas viven en `src/database`, fuera de las pantallas. La interfaz recibe el contexto SQLite mediante `SQLiteProvider`.
- **Dinero en centavos enteros:** los importes persistidos usarán enteros; se formatean al presentar con `Intl.NumberFormat('es-MX', { currency: 'MXN' })`.

Referencias versionadas: [Expo SQLite SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/) y [Expo Router](https://docs.expo.dev/versions/v58.0.0/sdk/router/).

## Límites de capas

`app/` contiene navegación y pantallas; `src/database/` contiene migraciones y consultas; `src/domain/` recibirá entidades y reglas de negocio puras; `src/infrastructure/` recibirá adaptadores de archivos, impresión y hardware cuando se implementen. Los componentes no deben escribir directamente SQL en la interfaz.

## Persistencia y cambios de esquema

`ferrepos.db` usa WAL y claves foráneas. `schema_migrations` registra versiones aplicadas. Cada migración futura debe ejecutarse en transacción y conservar datos históricos. La migración 1 crea ajustes locales y catálogo inicial vacío.

## Estrategia futura de sincronización

Cada entidad sincronizable tendrá UUID, `created_at`/`updated_at` UTC y movimientos auditables. Una edición en línea futura puede implementar una cola local idempotente y reintentos en un repositorio remoto, con resolución explícita de conflictos por negocio. La edición local no mostrará estados de sincronización ni enviará datos.

## Límites actuales

No se han implementado todavía ventas, autenticación local, copia/restauración, cifrado SQLite, impresoras ni escáner. Esas funciones necesitan decisiones y validación en las fases posteriores; el dashboard no muestra métricas inventadas.
