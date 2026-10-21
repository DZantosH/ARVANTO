# Decisiones técnicas

| Tema | Decisión inicial | Motivo |
| --- | --- | --- |
| Plataforma | Expo SDK 58 + React Native 0.88 | La plantilla oficial crea una base actual para Android; permite agregar módulos nativos mediante development build cuando hagan falta. |
| Navegación | Expo Router | Integrado en la plantilla y adecuado para separar pantallas por módulos. |
| Datos | SQLite con expo-sqlite | Persistencia en dispositivo y uso sin conexión; no requiere servidor para vender en fases posteriores. |
| Estado | Estado local de React por pantalla | No hay estado global de negocio todavía; SQLite seguirá siendo la fuente de verdad. |
| Dinero | Enteros en centavos | Evita errores de coma flotante al sumar importes. |
| Diseño visual | Paleta naranja industrial y grafito, superficies planas y radios de 0–4 dp | La jerarquía se apoya en espaciado, contraste y texto; evita tarjetas e iconos decorativos repetidos. Los colores, radios, espaciado y escala tipográfica viven en `constants/Theme.ts`. |
| Texto sobre naranja | Grafito sobre naranja y naranja oscuro para texto sobre blanco | Mantiene contraste legible sin cambiar el naranja de marca definido en la guía visual. |
| Demo | Sin seed automático | No presentar cifras ficticias como ventas reales. |
| Nombre | FerrePOS interno provisional | No se afirma disponibilidad de marca. |
| Identidad visual | Marca propia con grafito, naranja y blanco | Ícono de tienda original; sus fuentes SVG están en `assets/images/`. |

No se añadieron Zod, formularios, ORM, analítica ni gráficas porque todavía no existe un flujo que los necesite.
