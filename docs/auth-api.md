# Contrato para la futura web de ARVANTO

Estado: pendiente de implementar y desplegar. La aplicación no registra cuentas ni contiene credenciales provisionales. La URL prevista es `https://arvanto.asyncz.tech`; la base del cliente móvil está en `src/config/auth.ts` como `https://arvanto.asyncz.tech/api`.

## Credenciales y sesión

`POST /auth/login`, JSON:

```json
{"username":"usuario","password":"contraseña"}
```

Respuesta de acceso y de `GET /auth/session`:

```json
{
  "token":"token-opaco-generado-por-el-servidor",
  "expiresAt":"2099-01-01T23:59:59Z",
  "businessDayId":"jornada-del-negocio",
  "businessDayOpen":true,
  "user":{
    "id":"identificador-web",
    "username":"usuario",
    "name":"Nombre visible",
    "role":"admin",
    "businessId":"identificador-negocio"
  }
}
```

La fecha es ilustrativa. El servidor debe asignar un vencimiento adecuado para la jornada y revocar al cerrar el negocio. Perfiles admitidos: `admin`, `manager`, `cashier`. El cliente no concede perfiles ni crea cuentas. Las contraseñas se verifican y almacenan mediante un algoritmo de contraseñas adecuado en el servidor. El servidor debe limitar intentos y validar negocio, usuario y jornada en cada operación protegida.

Las peticiones autenticadas incluyen `Authorization: Bearer <token>`. `GET /auth/session` comprueba la vigencia y devuelve los permisos actuales; no debe reabrir una jornada cerrada. Un token robado o revocado debe rechazarse por el servidor.

## Cierres

- `POST /auth/logout`, JSON `{}`: revoca el token actual.
- `POST /business-days/{businessDayId}/close`, JSON `{}`: finaliza la jornada y revoca todas sus sesiones. El servidor valida que el usuario tenga permiso para cerrar el negocio. Debe ser idempotente para permitir reintentos.
- Respuesta exitosa: `204 No Content` o JSON válido con estado 200.
- `401`: credenciales inválidas o sesión revocada/vencida.
- `403` o `410`: usuario bloqueado, acceso denegado o jornada cerrada.
- `429`: demasiados intentos; el cliente muestra un mensaje de espera.

El cierre desde Caja invalida de inmediato la sesión de este teléfono dentro de la transacción local. Si falta conexión, guarda una revocación pendiente en el almacén cifrado y la reintenta al regresar y antes del siguiente login. La garantía de cierre en otros dispositivos requiere el servidor y conectividad. El servidor también debe hacer cumplir el vencimiento de jornada aunque un teléfono permanezca sin conexión.

## Registro y recuperación

El formulario de registro, verificación de identidad, alta de negocio, invitaciones, contraseñas y recuperación se implementarán en la web. La app móvil solo consumirá la autenticación. No se abre un formulario de registro desde su login.

## Pruebas

`src/auth/*.test.ts` valida el contrato y la persistencia con servicios simulados. Para probar todo el flujo de verdad se necesita desplegar esta API, registrar una cuenta desde la web, iniciar sesión, reiniciar la app y cerrar la jornada desde un segundo dispositivo.
