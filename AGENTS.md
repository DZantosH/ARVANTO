# ARVANTO development instructions

This project uses React Native Community CLI and TypeScript. The user explicitly requested removal of Expo; do not add Expo, Expo Router, EAS, or Expo modules.

- Android is the implemented native target. Maintain `android/` directly and keep native sources in version control.
- Use React Navigation. Screens live in `src/screens/`; register routes in `App.tsx`.
- Preserve the package `mx.arvanto.ferrepos` and the database at `files/SQLite/ferrepos.db` when upgrading installed devices.
- Native Android services are implemented in `ArvantoPlatform.kt`; their typed adapter is `src/native/platform.ts`.
- All database operations must use parameter binding. Keep transactions isolated through `src/native/database.tsx`.
- Use npm for dependencies. Check current official React Native/Android/library docs before using APIs.
- Run `npm run lint`, `npm run typecheck`, and tests appropriate to a change before declaring it complete.
- Debug builds need Metro (`npm start`). Release builds must include the JS bundle and start without Metro.
- Never commit signing secrets, local database copies, `local.properties`, or native build artifacts.
- Keep mobile performance, safe areas, accessibility and clear Spanish UI labels.
