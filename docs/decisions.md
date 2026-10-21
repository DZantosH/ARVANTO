# Decisiones técnicas

| Tema | Decisión inicial | Motivo |
| --- | --- | --- |
| Plataforma | Expo SDK 58 + React Native 0.88 | La plantilla oficial crea una base actual para Android; permite agregar módulos nativos mediante development build cuando hagan falta. |
| Navegación | Expo Router | Integrado en la plantilla y adecuado para separar pantallas por módulos. |
| Datos | SQLite con expo-sqlite | Persistencia en dispositivo y uso sin conexión; no requiere servidor para vender en fases posteriores. |
| Estado | Estado local de React por pantalla | No hay estado global de negocio todavía; SQLite seguirá siendo la fuente de verdad. |
| Dinero | Enteros en centavos | Evita errores de coma flotante al sumar importes. |
| Demo | Sin seed automático | No presentar cifras ficticias como ventas reales. |
| Nombre | FerrePOS interno provisional | Nombre solicitado por la especificación; no se afirma disponibilidad de marca. |
| Identidad visual | Ícono propio de tienda con techo verde, toldo ámbar y puerta clara | Sustituye los recursos genéricos de la plantilla; SVG fuente en `assets/images/`. |

No se añadieron Zod, formularios, ORM, analítica ni gráficas porque todavía no existe un flujo que los necesite.
