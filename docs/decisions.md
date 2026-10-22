# Decisiones técnicas

| Tema | Decisión actual | Motivo |
| --- | --- | --- |
| Plataforma | React Native 0.88 con Community CLI | Solicitud expresa de usar React Native sin Expo. |
| Navegación | React Navigation | Stack y pestañas registrados explícitamente; rutas condicionadas al perfil. |
| Persistencia | Android SQLite y adaptador TypeScript | Conserva la base y repositorios existentes; transacciones aisladas y parámetros tipados. |
| Servicios | Módulo nativo Kotlin | Archivos, Keystore, AES-GCM, compartir, PDF, impresión y OCR sin runtime de Expo. |
| APK | Variante release con bundle incluido | Puede abrir sin Metro ni computadora. |
| Actualizaciones | Mismo package y firma de desarrollo existente | Actualizar la instalación del teléfono conservando sus datos. Configurar firma propia antes de distribución pública. |
| Datos monetarios | Enteros en centavos | Evita errores de coma flotante. |
| Diseño | Naranja y grafito, temas claro/oscuro/sistema | Mantiene el diseño acordado y las preferencias del dispositivo. |
| Datos iniciales | Sin demostración ni usuarios predefinidos | El usuario configura su propio administrador y catálogo. |

Las decisiones anteriores basadas en Expo fueron sustituidas durante la migración del 22 de octubre de 2026.
