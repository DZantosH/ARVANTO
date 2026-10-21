# Verificación

## Entorno

- Node.js 26.12.0 y npm 12.2.1.
- OpenJDK 25 disponible.
- Dispositivo Android conectado por ADB para la verificación de CRUD.

## Resultados

- `npx expo lint`: pasó.
- `npx tsc --noEmit`: pasó.
- `npm test`: pasó, 2 suites y 13 casos sobre dinero y validación de productos.
- `npx expo-doctor`: 20/20 comprobaciones.
- `npx expo export --platform android`: pasó; Metro creó el bundle Android.
- `npx expo run:android`: build debug nativa del CRUD pasó en 30 s y se instaló en M2101K6R. Se abrió el catálogo vacío y el formulario de producto. La migración 2 se confirmó en SQLite del dispositivo. No se completó un alta manual en el dispositivo.
- Se leyó la SQLite creada en el dispositivo: migración 1 aplicada, tablas `schema_migrations`, `business_settings`, `products`, negocio provisional y moneda MXN. Tras forzar cierre y relanzar la app, la migración y los ajustes siguieron presentes.
- `npm audit --omit=dev --audit-level=high`: encontró dependencias transitivas vulnerables en la cadena Expo/Metro y `node-forge`; npm propone como arreglo forzado bajar Expo a 44. No se aplicó porque rompe el SDK seleccionado. Revisar en una actualización compatible de Expo. La instalación de Jest también muestra avisos en dependencias de desarrollo; el audit completo registra 54 vulnerabilidades (26 moderadas, 28 altas).

La persistencia básica se comprobó tras relanzar la app. La restauración de respaldo todavía no se ha validado; no existe aún el flujo de respaldo. La interfaz del build debug necesita Metro porque se trata de una compilación de desarrollo.
