# Soluciones Aplicadas a las Vulnerabilidades de Seguridad

Documento que detalla las correcciones implementadas para cada hallazgo del análisis de ciberseguridad (`Issues.md`).

---

## Resumen de estado

| # | Hallazgo | Severidad | Estado |
|---|----------|-----------|--------|
| 1 | Backdoor `test-token` | Critica | Corregido |
| 2 | Bus sin auth y expuesto al host | Critica | Corregido (ya estaba parcialmente resuelto) |
| 3 | Clave Supabase privilegiada en frontend | Critica | Corregido (ya estaba parcialmente resuelto) |
| 4 | `scomp` sin verificacion de identidad (IDOR) | Alta | Corregido |
| 5 | URL de comprobante no validada | Alta | Corregido |
| 6 | Validacion de saldo solo en el cliente | Alta | Corregido |
| 7 | Tokens en query string | Alta | Corregido |
| 8 | Control de acceso a vistas via `localStorage` | Alta | Corregido |
| 9 | URL de comprobante no validada en frontend | Alta | Corregido |
| 10 | Bucket de comprobantes publico | Alta | Parcial (requiere config en Supabase) |
| 11 | Dependencias con CVEs | Alta | Parcial (requiere `npm audit fix`) |
| 12 | Dependencias innecesarias | Alta | Corregido |
| 13 | CORS abierto | Media | Corregido |
| 14 | Sin rate limiting en login | Media | Corregido |
| 15 | Roles inconsistentes ("admin" inexistente) | Media | Corregido |
| 16 | Filtracion de errores internos | Media | Corregido |
| 17 | Politica de contrasenas debil | Media | Corregido |
| 18 | Service Worker cachea respuestas API | Media | Corregido |
| 19 | Token en `localStorage` | Baja | Documentado (cambio arquitectural mayor) |
| 20 | Saldo negativo no controlado | Baja | Corregido |
| 21 | `--reload` en imagen de gateway | Baja | Corregido |
| 22 | `window.open` sin `noopener` | Baja | Corregido |
| 23 | Credenciales de prueba en tests | Baja | Documentado (mejora futura) |
| 24 | Botones aprobar/rechazar visibles sin permisos | Baja | Corregido |
| 25 | Errores de tipo, rol fallback y falta de logging en `ssald` | Media | Corregido |

---

## Detalle de cada correccion

### 1. Backdoor `test-token` en `sauth` y `scomp`

**Archivo:** `services/scomp/scomp_service.py`

La constante `TEST_TOKEN = "test-token-123"` fue eliminada por completo del codigo. Las funciones `ping_test()` y la referencia a `TEST_TOKEN` como valor por defecto en `procesar_mensaje` (linea 209 original: `token = payload.get("token", TEST_TOKEN)`) fueron removidas.

En `sauth_service.py`, la funcion `op_verify` ya habia sido corregida previamente: ahora verifica todo token contra Supabase sin excepciones ni atajos.

**Cambios:**
- Eliminada la constante `TEST_TOKEN` de `scomp_service.py`
- Eliminada la funcion `ping_test()` que usaba el token de prueba
- Eliminado el fallback a `TEST_TOKEN` en `procesar_mensaje`
- Eliminada la cuenta regresiva y test inicial en `main()` que usaban el token de prueba

---

### 2. Bus SOA sin autenticacion y expuesto al host

**Archivos:** `bus/bus.py`, `docker-compose.yml`

Este hallazgo ya habia sido **parcialmente corregido** antes de esta revision:
- `docker-compose.yml` ya usa `expose: ["5000"]` en lugar de `ports: ["5000:5000"]`, por lo que el bus NO es accesible desde fuera de la red Docker
- `bus/bus.py` ya implementa autenticacion mediante `BUS_SECRET` en el registro `sinit`
- Ya existe proteccion anti-secuestro: no se permite reemplazar un servicio ya registrado

**Estado:** Ya corregido. No se requirieron cambios adicionales.

---

### 3. Clave Supabase privilegiada expuesta al frontend

**Archivo:** `docker-compose.yml`, `.env.example`

Este hallazgo ya habia sido **corregido** antes de esta revision:
- `docker-compose.yml` ahora usa `VITE_SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}` (clave separada de bajo privilegio)
- `.env.example` documenta claramente dos claves separadas: `SUPABASE_KEY` (service_role, solo backend) y `SUPABASE_ANON_KEY` (anon, para frontend)

**Estado:** Ya corregido. No se requirieron cambios adicionales.

---

### 4. `scomp` sin verificacion de identidad (IDOR)

**Archivo:** `services/scomp/scomp_service.py`

Todas las operaciones de comprobantes (`subir_comprobante`, `obtener_url`, `vincular_comprobante`, `eliminar_comprobante`) ahora **requieren un token de sesion valido**.

**Cambios:**
- `procesar_mensaje()` ahora exige un token en cada operacion (excepto `ping`)
- El token se verifica contra `sauth` usando la funcion `verificar_token()`
- El `user_id` se deriva del token verificado, **no del payload del cliente**
- Las firmas de las funciones de comprobantes ahora reciben `user_id` como parametro verificado

---

### 5. URL de comprobante no validada antes de operar sobre el storage

**Archivos:** `services/scomp/scomp_service.py`, `services/sgast/sgast_service.py`

Se agrego validacion de URL en ambos servicios.

**Cambios en `scomp_service.py`:**
- Nueva funcion `_validar_url_comprobante()` que verifica que la URL pertenezca al dominio Supabase del proyecto y al bucket `comprobantes`
- `subir_comprobante()` valida la URL antes de almacenarla
- `eliminar_comprobante()` valida la URL almacenada antes de intentar borrar del storage

**Cambios en `sgast_service.py`:**
- Nueva funcion `_validar_url_comprobante()` con la misma logica
- `crear_gasto()` valida la URL del comprobante antes de insertar el gasto

---

### 6. Validacion de saldo disponible solo en el cliente

**Archivo:** `services/sgast/sgast_service.py`

**Cambios:**
- `crear_gasto()` ahora consulta el `saldo_disponible` del usuario en la tabla `profiles` antes de insertar el gasto
- Si el monto excede el saldo disponible, se rechaza la operacion con un mensaje descriptivo
- Se agrego validacion de que el monto sea un numero positivo

---

### 7. Tokens de sesion viajan como parametros de query string

**Archivos:** `gateway/main.py`, `frontend/src/Operario.tsx`, `frontend/src/AdminView.tsx`, `frontend/src/DirectorioUsuarios.tsx`

Todos los endpoints GET del gateway que recibian el token como query parameter ahora lo reciben exclusivamente via el header `Authorization: Bearer <token>`.

**Cambios en el gateway (`gateway/main.py`):**
- Nueva funcion helper `_extract_token()` que extrae el token del header Authorization
- Endpoints migrados: `/auth/usuarios`, `/gastos`, `/saldos/mio`, `/saldos/{user_id}`, `/comprobantes/{gasto_id}`, `/reportes/resumen`, `/reportes/listar`
- El endpoint DELETE `/usuarios/{user_id}` tambien fue migrado

**Cambios en el frontend:**
- `Operario.tsx`: las llamadas a `/saldos/mio` y `/gastos` ahora envian `Authorization: Bearer` en los headers
- `AdminView.tsx`: la llamada a `/gastos` ahora usa header Authorization
- `DirectorioUsuarios.tsx`: las llamadas a `/auth/usuarios` y DELETE `/usuarios/{id}` ahora usan header Authorization

---

### 8. Control de acceso a vistas basado en `localStorage` manipulable

**Archivo:** `frontend/src/App.tsx`

**Cambios:**
- Al cargar la aplicacion, si existe un token en localStorage, se verifica contra el backend via `/auth/verify` antes de mostrar cualquier vista
- El rol se obtiene de la respuesta del backend, no de localStorage
- Si la verificacion falla (token invalido/expirado), se limpia localStorage y se muestra el login
- Se elimino el rol "admin" inexistente de las comparaciones (solo se usan "operario", "contador", "tecnico")

---

### 9. URL de comprobante no validada renderizada en el navegador

**Archivos:** `frontend/src/lib/supabase.ts`, `frontend/src/AdminView.tsx`, `frontend/src/expense-detail-modal.tsx`

**Cambios:**
- Nuevas funciones `isValidComprobanteSrc()` y `safeImageSrc()` en `lib/supabase.ts` que validan que la URL pertenezca al dominio Supabase y al bucket de comprobantes
- En `AdminView.tsx` y `expense-detail-modal.tsx`, las etiquetas `<img>` ahora usan `safeImageSrc(expense.photo)` en lugar de `expense.photo` directo, evitando renderizar URLs arbitrarias

---

### 10. Bucket de comprobantes publico

**Estado: Parcialmente mitigado.**

La validacion de URLs en backend y frontend (Issues 5 y 9) reduce el riesgo, pero la configuracion del bucket como privado requiere cambios en el dashboard de Supabase Storage que no son controlables desde el codigo:

1. Cambiar el bucket `comprobantes` a **privado** en Supabase Dashboard
2. Generar URLs firmadas desde el backend en vez de usar `getPublicUrl()`
3. Modificar `expense-form.tsx` para subir via el backend en vez de directamente a Supabase

---

### 11. Dependencias del frontend con CVEs conocidos

**Estado: Parcialmente resuelto.**

Se eliminaron las dependencias innecesarias (ver Issue 12). Para las vulnerabilidades conocidas en `vite`, `dompurify` y `esbuild`, se debe ejecutar:

```bash
cd frontend && npm audit fix
```

---

### 12. Dependencias innecesarias / riesgo de cadena de suministro

**Archivo:** `frontend/package.json`

**Cambios:**
- Eliminado `postgres` (cliente PostgreSQL, no tiene lugar en una app de navegador)
- Eliminado `expense` (paquete generico sin uso, riesgo de typosquatting)
- Eliminados `react-router` y `react-router-dom` (no se usan en el codigo)

---

### 13. CORS completamente abierto

**Archivos:** `gateway/main.py`, `docker-compose.yml`, `.env.example`

**Cambios:**
- `allow_origins` ahora se configura via la variable de entorno `CORS_ORIGINS` en vez de usar `"*"`
- Valor por defecto: `http://localhost:5173` (solo el frontend local)
- Se agrego `CORS_ORIGINS` al servicio `gateway` en `docker-compose.yml`
- Se documento la variable en `.env.example`

---

### 14. Sin limite de intentos en el login

**Archivo:** `gateway/main.py`

**Cambios:**
- Implementado rate limiting por IP en el endpoint `POST /auth/login`
- Limite: 5 intentos por IP en ventana de 60 segundos
- Al exceder el limite, se retorna HTTP 429 con mensaje descriptivo
- Los intentos antiguos se limpian automaticamente al expirar la ventana

---

### 15. Inconsistencia en el control de acceso por rol ("admin" inexistente)

**Archivos:** `services/sgast/sgast_service.py`, `services/ssald/ssald_service.py`, `frontend/src/App.tsx`

**Cambios:**
- `sgast_service.py`: el check de `listar_gastos` cambiado de `["admin", "contador"]` a `["tecnico", "contador"]`
- `ssald_service.py`: `obtener_saldo_operario` cambiado de `["contador", "admin"]` a `["contador", "tecnico"]`
- `ssald_service.py`: `cambiar_estado` cambiado de `["contador", "admin"]` a `["contador", "tecnico"]`
- `App.tsx`: eliminado el rol "admin" de las comparaciones de vista

---

### 16. Filtracion de detalles internos en mensajes de error

**Archivos:** Todos los microservicios (`sauth_service.py`, `sgast_service.py`, `ssald_service.py`, `scomp_service.py`, `srept_service.py`) y `gateway/main.py`

**Cambios:**
- Todos los bloques `except Exception as e: return {"status": "error", "mensaje": str(e)}` fueron reemplazados por mensajes genericos
- Los `PermissionError` se siguen exponiendo al cliente (son mensajes controlados de autorizacion)
- Las excepciones genericas ahora retornan mensajes como "Error interno al crear usuario.", "Error interno del servicio.", etc.
- En el gateway, `call_service` ya no expone `str(e)` en la respuesta HTTP 500

---

### 17. Politica de contrasenas debil y sin validacion en el servidor

**Archivo:** `services/sauth/sauth_service.py`

**Cambios:**
- Nueva funcion `_validar_password()` que verifica:
  - Longitud minima de 8 caracteres
  - Al menos una letra mayuscula
  - Al menos una letra minuscula
  - Al menos un numero
- `op_create_user()` valida la contrasena antes de crear el usuario en Supabase
- La validacion se aplica en el servidor, independientemente de lo que haga el frontend

---

### 18. Service Worker cachea respuestas autenticadas

**Archivo:** `frontend/public/sw.js`

**Cambios:**
- El service worker ahora **excluye explicitamente** todas las peticiones API del cache:
  - Rutas que empiezan con `/auth`, `/gastos`, `/saldos`, `/comprobantes`, `/reportes`, `/usuarios`
  - Peticiones a origenes distintos al del frontend
- Solo se cachean recursos estaticos (HTML, JS, CSS, imagenes de la app)
- Se agrego un listener de mensajes `CLEAR_CACHE` que permite limpiar todo el cache desde el frontend
- Se incremento la version del cache a `gastos-v2` para forzar la actualizacion
- En `Operario.tsx`, el cierre de sesion ahora envia `CLEAR_CACHE` al service worker

---

### 19. Tokens de sesion almacenados en `localStorage`

**Estado: Documentado como mejora futura.**

Migrar a cookies `httpOnly` + `secure` requiere cambios arquitecturales significativos:
- El gateway tendria que manejar cookies y establecer headers `Set-Cookie`
- Se necesitaria proteccion CSRF adicional
- El flujo de autenticacion cambiaria completamente

La mitigacion actual (verificacion de token contra backend en cada carga, CORS restrictivo, sin XSS detectado) reduce el riesgo a un nivel aceptable.

---

### 20. Posible saldo negativo no controlado

**Archivo:** `services/ssald/ssald_service.py`

**Cambios:**
- `cambiar_estado()`: al aprobar un gasto, se verifica que `nuevo_saldo >= 0` antes de actualizar. Si el saldo seria negativo, se rechaza la operacion
- `op_asignar_saldo()`: se valida que el saldo asignado no sea negativo (`saldo < 0` retorna error)

---

### 21. Modo `--reload` de Uvicorn en la imagen de contenedor

**Archivo:** `gateway/Dockerfile`

**Cambios:**
- Se reemplazo `--reload` por `--workers 2` en el comando de inicio
- Esto elimina el overhead del file watcher en produccion y proporciona concurrencia adecuada

---

### 22. Apertura de URLs sin proteccion `noopener`

**Archivo:** `frontend/src/expense-detail-modal.tsx`

**Cambios:**
- `window.open(data.pdf_url, '_blank')` cambiado a `window.open(data.pdf_url, '_blank', 'noopener,noreferrer')`
- Esto previene reverse tabnabbing y filtracion del Referer

---

### 23. Credenciales de prueba hardcodeadas en tests

**Estado: Documentado como mejora futura.**

Los archivos de test (`test_sauth.py`, `test_srept.py`, `test_sgast.py`) contienen credenciales fijas. Para una correccion completa se recomienda:
- Generar credenciales aleatorias en cada ejecucion de tests
- Usar un proyecto Supabase de testing dedicado
- Limpiar las cuentas creadas al finalizar los tests

---

### 24. Botones de aprobacion/rechazo visibles para usuarios sin permisos

**Archivo:** `frontend/src/expense-detail-modal.tsx`

El modal de detalle de gasto mostraba los botones "Aprobar" y "Rechazar" a todos los usuarios cuando el gasto estaba pendiente, sin verificar el rol. Aunque el backend rechazaba correctamente la operacion, un operario podia intentar aprobar y recibir un error confuso ("Sin permisos para cambiar estado de gastos").

**Cambios:**
- La condicion de renderizado de los botones cambiada de `expense.estado === 'pendiente'` a `expense.estado === 'pendiente' && localStorage.getItem('scg_rol') === 'contador'`
- Los botones ahora solo se muestran a usuarios con rol `contador`
- La autorizacion real sigue siendo responsabilidad del backend (`ssald` valida el rol del token)

---

### 25. Errores de tipo, rol fallback incorrecto y falta de logging en `ssald`

**Archivo:** `services/ssald/ssald_service.py`

La aprobacion de gastos por el contador fallaba con "Error interno al cambiar estado del gasto" sin dejar rastro diagnosticable en los logs. El problema era una combinacion de tres defectos.

**Cambios:**

1. **Rol fallback corregido:** en `verificar_token()`, el valor por defecto cambiado de `"operador"` (inexistente en el sistema) a `"operario"` (el rol valido de menor privilegio)
   - Antes: `perfil.data.get("rol", "operador")`
   - Despues: `perfil.data.get("rol", "operario")`

2. **Conversion de tipo en saldo:** en `cambiar_estado()`, el resultado de `saldo_actual - monto` ahora se convierte a `int()` antes de escribir en la columna `saldo_disponible` (tipo `BIGINT`), evitando incompatibilidad de tipos float/BIGINT
   - Antes: `nuevo_saldo = saldo_actual - monto`
   - Despues: `nuevo_saldo = int(saldo_actual - monto)`

3. **Logging de excepciones:** el bloque `except Exception` en `cambiar_estado()` ahora imprime la excepcion real en los logs del contenedor para facilitar la depuracion, sin exponer el detalle al cliente
   - Antes: `except Exception:`
   - Despues: `except Exception as e: print(f"[ssald] Error en cambiar_estado: {e}")`

4. **`str()` en user_id:** `verificar_token()` ahora convierte `data.user.id` a string explicitamente con `str()`, evitando posibles problemas si el SDK devuelve un objeto UUID

---

## Notas adicionales

- **Issue 10 (bucket publico):** Requiere configuracion directa en Supabase Dashboard, no es resoluble solo con codigo.
- **Issue 11 (CVEs en dependencias):** Ejecutar `npm audit fix` en el directorio `frontend/` para actualizar las dependencias vulnerables.
- **Variables de entorno nuevas:** Se agrego `CORS_ORIGINS` al `.env.example` y al `docker-compose.yml`.
