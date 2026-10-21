# FerrePOS

Punto de venta local para ferreterías y tlapalerías en México. La aplicación está en fase inicial de desarrollo; hoy incluye la base Expo/React Native, la migración SQLite inicial y un dashboard sin datos ficticios.

## Requisitos y ejecución

- Node.js compatible con Expo SDK 58 (se desarrolló con Node 26.12.0).
- Android Studio/Android SDK o un dispositivo Android con Expo Go. `expo-sqlite` está disponible en Expo Go para esta primera etapa.

```bash
npm install
npx expo start
```

Para probar en Android con emulador, inicia el emulador y ejecuta `npm run android`. Para construir una aplicación instalable de producción se configurará un development build/EAS cuando se integren periféricos nativos.

## Estado

- Fase 0: arquitectura y documentación inicial.
- Fase 1 base: SQLite local con migraciones versionadas, ajustes del negocio, catálogo inicial y dashboard conectado a la base local.
- Siguientes: CRUD de productos e inventario, POS transaccional y caja.

El dashboard muestra cero tickets e importe cero porque el módulo de ventas todavía no está implementado. No se carga información de demostración.

## Comprobaciones

```bash
npx expo lint
npx tsc --noEmit
npm test
npx expo-doctor
```

Consulta [docs/testing.md](docs/testing.md) para los resultados y limitaciones del entorno.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Modelo de datos inicial](docs/data-model.md)
- [Decisiones técnicas](docs/decisions.md)
- [Plan y progreso](docs/progress.md)

La aplicación no necesita internet para consultar la base local. La licencia, sincronización, respaldos, venta, impresión y periféricos aún no están implementados.
