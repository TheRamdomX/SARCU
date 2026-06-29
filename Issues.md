# Análisis de Ciberseguridad — SCG (Sistema de Control de Gastos)

Revisión de código fuente de **todos** los componentes del proyecto: `bus/`, `gateway/`, `services/*` (incluidos los 5 microservicios, sus tests y librerías compartidas) y `frontend/` (todos los componentes, hooks, librerías, configuración, service worker y manifest). Se incluye además **auditoría de dependencias** (`npm audit` para el frontend y revisión de versiones de Python) y revisión del historial de git en busca de secretos. Cada hallazgo indica archivo, líneas aproximadas, tipo de vulnerabilidad, impacto y la solución recomendada (sin código).

Los hallazgos están ordenados por severidad: 🔴 Crítica · 🟠 Alta · 🟡 Media · 🔵 Baja/Informativa

### Alcance de la revisión

| Categoría | Archivos | Estado |
|-----------|----------|--------|
| Bus SOA | `bus/*.py`, `bus/Dockerfile` | ✅ Revisado |
| Gateway | `gateway/main.py`, `Dockerfile`, `requirements.txt` | ✅ Revisado |
| Microservicios | `services/{sauth,sgast,ssald,scomp,srept}/*.py`, Dockerfiles, `soa_lib.py`, tests | ✅ Revisado |
| Frontend (lógica) | `App.tsx`, vistas, `lib/`, `expense-form`, `pdf-generator`, modales | ✅ Revisado |
| Frontend (UI) | componentes Radix/shadcn (`dialog`, `select`, `table`, etc.) | ✅ Revisado (sin hallazgos: presentacionales) |
| PWA | `public/sw.js`, `public/manifest.json`, `main.tsx` | ✅ Revisado |
| Config | `docker-compose.yml`, `.env.example`, `.gitignore`, `vite.config.ts`, `tsconfig*`, `eslint`, `package.json` | ✅ Revisado |
| Dependencias | `npm audit`, versiones Python | ✅ Auditado |
| Historial git | búsqueda de secretos committeados | ✅ Revisado (sin secretos reales) |

---

# 🔴 Críticas

## 🔴 1. Backdoor de autenticación con token fijo "test-token"

**Archivo:** `services/sauth/sauth_service.py`, función `op_verify` (líneas ~163-172)

Si el token recibido es exactamente la cadena `"test-token"`, el servicio devuelve una sesión válida con rol `tecnico` (el rol con más privilegios del sistema: crear/editar/eliminar usuarios, cambiar roles, asignar saldos) sin validar nada contra Supabase. Esta ruta es alcanzable desde el exterior a través del endpoint `GET /auth/verify` del gateway, simplemente enviando `Authorization: Bearer test-token`.

**Impacto:** cualquier persona, sin credenciales, obtiene acceso administrativo total al sistema.

**Solución:** eliminar por completo el modo de prueba con token fijo del código de producción. Si se necesita un modo de testing, debe activarse solo mediante una variable de entorno exclusiva de entornos de desarrollo (nunca presente en producción) y nunca debe otorgar el rol de mayor privilegio.

---

## 🔴 2. Bus SOA sin autenticación de servicios y expuesto al host

**Archivos:** `bus/bus.py` (función `client_handler`, líneas ~67-90) y `docker-compose.yml` (servicio `bus`, bloque `ports: - "5000:5000"`)

El bus acepta cualquier conexión TCP y permite registrarse como cualquier nombre de servicio (mensaje `sinit`) sin ningún tipo de credencial. Además, el diccionario `servicios` se sobreescribe sin comprobar si el nombre ya estaba en uso, por lo que un cliente nuevo puede reemplazar el registro de un servicio legítimo. El puerto 5000 además está publicado hacia el host (`5000:5000`), por lo que queda accesible desde fuera de la red interna de Docker.

**Impacto:** cualquier proceso que alcance ese puerto puede:
- Registrarse como `"sauth"` y capturar credenciales/tokens que otros servicios le envíen, o responder con verificaciones falsas (suplantación total de la autenticación).
- Enviar mensajes directamente a `sgast`, `ssald`, `scomp` o `srept`, evitando cualquier control que exista únicamente en el gateway.
- Provocar denegación de servicio desconectando/reemplazando el registro de un servicio real.

**Solución:** no publicar el puerto del bus hacia el host (debe ser accesible solo dentro de la red interna de Docker). Adicionalmente, implementar autenticación de servicio a servicio en el registro `sinit` (por ejemplo, un secreto compartido o certificados), y rechazar registros que intenten reutilizar un nombre ya activo.

---

## 🔴 3. Clave privilegiada de Supabase expuesta al navegador

**Archivo:** `docker-compose.yml`, servicio `frontend` (bloque `environment`, líneas ~150-160)

La variable `VITE_SUPABASE_ANON_KEY` se asigna al mismo valor que `SUPABASE_KEY`, la cual es usada por los microservicios backend (`sauth_service.py`, `scomp_service.py`, etc.) para operaciones administrativas como `auth.admin.create_user` y `auth.admin.delete_user`. Esas operaciones solo funcionan con la clave `service_role` (privilegio total sobre la base de datos y la autenticación), no con una clave `anon`. Como las variables `VITE_*` se incrustan en el bundle de JavaScript en tiempo de build, esa clave queda visible para cualquiera que inspeccione el código del frontend en el navegador.

**Impacto:** filtración de la clave maestra del proyecto Supabase, permitiendo a cualquier visitante leer/modificar/borrar cualquier tabla, crear o eliminar usuarios y saltarse cualquier política de RLS según cómo esté configurada.

**Solución:** usar dos claves completamente separadas: una clave `service_role` solo para los microservicios backend (nunca debe salir del entorno del servidor), y una clave `anon` distinta, de bajo privilegio, exclusivamente para el frontend. Nunca compartir la misma variable de entorno entre el backend administrativo y el cliente.

---

# 🟠 Altas

## 🟠 4. Falta de verificación de identidad en el servicio de comprobantes

**Archivo:** `services/scomp/scomp_service.py`, funciones `subir_comprobante`, `obtener_url`, `vincular_comprobante`, `eliminar_comprobante` (líneas ~29-150)

A diferencia de los demás microservicios (`sgast`, `ssald`, `sauth`), `scomp` no recibe ni valida ningún token de sesión en estas operaciones. Confía ciegamente en el campo `user_id` que viene en el payload del mensaje para decidir permisos (por ejemplo, "solo el dueño del gasto puede subir/eliminar su comprobante"). Cualquier emisor capaz de mandar un mensaje a `scomp` (incluyendo, dado el hallazgo #2, cualquier cliente del bus) puede poner el `user_id` de otra persona y operar en su nombre: ver comprobantes ajenos, adjuntar o borrar archivos de gastos que no le pertenecen.

**Impacto:** suplantación de identidad (IDOR) y acceso/alteración de comprobantes de otros usuarios.

**Solución:** exigir y validar un token de sesión igual que en `sgast`/`ssald` (verificación contra Supabase Auth) en cada operación, derivando el `user_id` del token verificado y no de un campo enviado libremente por el cliente.

---

## 🟠 5. URL de comprobante no validada antes de operar sobre el storage

**Archivo:** `services/scomp/scomp_service.py`, funciones `subir_comprobante` (acepta `url` libremente, líneas ~29-66) y `eliminar_comprobante` (deriva la ruta del bucket a partir de esa URL, líneas ~119-150)

La URL del comprobante se acepta tal cual desde el payload sin validar que realmente pertenezca al bucket/proyecto de Supabase esperado. Más adelante, `eliminar_comprobante` extrae la ruta del archivo a borrar simplemente recortando el texto alrededor de `/object/public/comprobantes/`. Si la URL almacenada fue manipulada (posible combinándolo con el hallazgo #4), se podría inducir al servicio a intentar borrar una ruta arbitraria dentro del bucket.

**Impacto:** posible borrado de archivos arbitrarios dentro del bucket de comprobantes.

**Solución:** validar que la URL recibida pertenezca efectivamente al dominio y bucket esperados (por ejemplo, comprobando el host y el prefijo) antes de guardarla, y/o generar las rutas de almacenamiento del lado del servidor en lugar de aceptar URLs completas del cliente.

---

## 🟠 6. Validación de saldo disponible solo en el cliente

**Archivo:** `frontend/src/expense-form.tsx` (validación `numAmount > availableBalance`, líneas ~46-50) vs. `services/sgast/sgast_service.py`, función `crear_gasto` (líneas ~42-66)

El frontend impide enviar un gasto que supere el saldo disponible del operario, pero esa regla no se repite en el backend: `crear_gasto` en `sgast_service.py` inserta el gasto en la base de datos sin comprobar el `saldo_disponible` del usuario en ningún momento.

**Impacto:** un atacante que hable directamente con el gateway/bus (sin pasar por la interfaz web) puede crear gastos por cualquier monto, sin límite, evadiendo el control de presupuesto.

**Solución:** repetir la validación de saldo disponible en el microservicio `sgast` antes de insertar el gasto, tratando la del frontend solo como una mejora de experiencia de usuario, nunca como control de seguridad.

---

## 🟠 7. Tokens de sesión viajan como parámetros de query string

**Archivo:** `gateway/main.py` — endpoints `GET /auth/usuarios`, `GET /saldos/mio`, `GET /saldos/{user_id}`, `GET /comprobantes/{gasto_id}`, `GET /reportes/resumen`, `GET /reportes/listar`, `GET /gastos` (todos reciben `token: str` como parámetro de query, distribuidos a lo largo del archivo)

El JWT de sesión se pasa como parámetro en la URL en varios endpoints GET, en lugar de usar la cabecera `Authorization` (que sí se usa correctamente en `/auth/verify`). Los parámetros de query quedan registrados en logs de servidores/proxies intermedios, en el historial del navegador, y pueden filtrarse vía la cabecera `Referer`.

**Impacto:** exposición de tokens de sesión en sistemas de logging u otros canales no destinados a datos sensibles, facilitando robo de sesión.

**Solución:** migrar todos estos endpoints para recibir el token exclusivamente mediante la cabecera `Authorization: Bearer`, igual que ya se hace en `/auth/verify`.

---

## 🟠 8. Control de acceso a vistas basado en `localStorage` manipulable

**Archivos:** `frontend/src/App.tsx` (líneas ~10-18 y ~57-69), y el patrón se repite en `Operario.tsx`, `AdminView.tsx`, `DirectorioUsuarios.tsx`, `CrearUsuario.tsx` (`localStorage.getItem('scg_rol')` / `scg_token`)

La decisión de qué panel mostrar (operario, contador/`AdminView`, o `TecnicoView` con gestión de usuarios) se toma leyendo el valor `scg_rol` directamente desde `localStorage`, que el propio usuario puede editar libremente desde la consola del navegador. Estableciendo manualmente `scg_rol` a `tecnico` o `contador`, cualquier usuario autenticado (p. ej. un operario) renderiza la interfaz administrativa, incluidos los formularios de creación/eliminación de usuarios y asignación de saldos.

**Impacto:** aunque los microservicios todavía validan el rol real del token antes de ejecutar operaciones sensibles (lo que limita el daño a datos), se trata de un control de acceso roto del lado del cliente (*broken access control / insecure design*): expone funcionalidad y estructura administrativa, y convierte cualquier debilidad de autorización del backend (como las del hallazgo #15) en una escalada directa de privilegios.

**Solución:** no confiar nunca en el rol almacenado en el cliente para autorizar. La aplicación debe derivar el rol de una verificación del token contra el backend en cada carga (endpoint `verify`), y cada operación del backend debe re-validar el rol del token. El valor en `localStorage` solo debe usarse como pista de presentación, nunca como control de seguridad.

---

## 🟠 9. URL de comprobante de gasto no validada y renderizada en el navegador del contador

**Archivos:** `services/sgast/sgast_service.py`, función `crear_gasto` (almacena `payload["comprobanteUrl"]` sin validar, líneas ~42-66); `frontend/src/AdminView.tsx` (línea ~505: `<img src={expense.photo} ...>`) y `frontend/src/expense-detail-modal.tsx` (línea ~121: `<img src={expense.photo} ...>`)

Al crear un gasto, el microservicio `sgast` guarda en la base de datos la URL del comprobante exactamente como llega en el payload, sin comprobar que pertenezca al bucket/dominio esperado de Supabase Storage. Posteriormente, esa URL se carga directamente como `src` de una etiqueta `<img>` en el panel del contador y en el modal de detalle. Un operario malicioso (o cualquiera que hable directo con el gateway) puede registrar un gasto con una URL arbitraria: un pixel de rastreo, una URL hacia un recurso interno de la red, o contenido controlado por el atacante que se cargará automáticamente en el navegador de un usuario con más privilegios cuando audite el gasto.

**Impacto:** inyección de contenido/URL almacenada; permite rastrear al contador, sondear recursos internos accesibles desde su navegador, o servir contenido malicioso en el contexto de la aplicación.

**Solución:** validar en `sgast` que la URL del comprobante corresponda al dominio y bucket legítimos antes de almacenarla (o generar la referencia del comprobante del lado del servidor). En el frontend, mostrar solo imágenes provenientes de orígenes en lista blanca.

---

## 🟠 10. Bucket de comprobantes público — documentos sensibles accesibles sin autenticación

**Archivos:** `frontend/src/expense-form.tsx` (líneas ~61-69: `upload(...)` seguido de `getPublicUrl(...)` sobre el bucket `comprobantes`) y `services/scomp/scomp_service.py` (comentarios y manejo de URLs públicas `/object/public/comprobantes/`)

Las fotos de boletas/comprobantes (que pueden contener datos personales, montos, lugares y otra información financiera sensible) se suben a un bucket de Supabase Storage configurado como **público** y se obtiene su URL mediante `getPublicUrl`. Cualquier persona que conozca o adivine la URL puede ver el documento sin autenticarse. Además, el nombre de archivo se genera con `Date.now()` más un sufijo aleatorio corto, lo que reduce la entropía y facilita ataques de enumeración.

**Impacto:** exposición de documentos financieros y datos personales a cualquiera en Internet con la URL, sin control de acceso.

**Solución:** usar un bucket privado y servir los comprobantes mediante URLs firmadas de duración limitada generadas por el backend solo a usuarios autorizados, en lugar de URLs públicas permanentes. Usar nombres de archivo con suficiente entropía (no predecibles).

---

## 🟠 11. Dependencias del frontend con vulnerabilidades conocidas

**Archivo:** `frontend/package.json` / `frontend/package-lock.json`

La auditoría de dependencias (`npm audit`) reporta 3 vulnerabilidades conocidas en el árbol de paquetes:
- **`vite` 7.0.0–7.3.3** (severidad **alta**): bypass de `server.fs.deny` en rutas alternativas de Windows y divulgación de hash NTLMv2 vía manejo de rutas UNC (`launch-editor`).
- **`dompurify` <=3.4.10** (severidad **media**): contaminación de configuración (`ALLOWED_ATTR` / Trusted Types) que puede sobrevivir a `clearConfig()` — relevante porque llega de forma transitiva (a través de `jspdf`, usado para generar los PDF) y `dompurify` es precisamente una librería de saneamiento.
- **`esbuild` 0.27.3–0.28.0** (severidad **baja**): lectura de archivos arbitraria al ejecutar el servidor de desarrollo en Windows.

**Impacto:** exposición a fallos conocidos en herramientas de build y en la librería de saneamiento de HTML; varios afectan principalmente al servidor de desarrollo, lo cual es más grave dado que el `Dockerfile` del frontend ejecuta `vite dev` como comando de arranque (relacionado con el hallazgo #21).

**Solución:** actualizar las dependencias a versiones parcheadas (`npm audit fix`), integrar la auditoría de dependencias en el flujo de CI, y no exponer el servidor de desarrollo de Vite en despliegues reales (servir el build estático de producción).

---

## 🟠 12. Dependencias innecesarias en el frontend (riesgo de cadena de suministro)

**Archivo:** `frontend/package.json` (sección `dependencies`, líneas ~12-30)

El `package.json` declara dependencias que **no se importan en ningún archivo del código fuente** (verificado con búsqueda en `frontend/src`):
- **`postgres` ^3.4.8**: un cliente de base de datos PostgreSQL incluido en el bundle de una aplicación de navegador. Un driver de base de datos no tiene ninguna razón legítima de estar en código de cliente; si llegara a usarse implicaría conexiones directas a la base de datos desde el navegador (exposición catastrófica de credenciales). Aunque hoy no se importa, su sola presencia es una señal de alarma y aumenta la superficie.
- **`expense` ^1.0.0**: un paquete genérico y ambiguo que no se utiliza; es un candidato típico a *typosquatting* / paquete basura y un riesgo de cadena de suministro.
- **`react-router` y `react-router-dom`**: declarados pero sin uso (la navegación se hace por estado en `App.tsx`).

**Impacto:** cada dependencia instalada ejecuta potenciales *scripts de instalación* y arrastra sus propias vulnerabilidades transitivas; paquetes innecesarios o ambiguos amplían la superficie de ataque y el riesgo de comprometer el build mediante la cadena de suministro.

**Solución:** eliminar del `package.json` toda dependencia que no se utilice (especialmente `postgres` y `expense`), fijar versiones, y revisar el origen/legitimidad de cada paquete antes de incorporarlo. Mantener un proceso de revisión de dependencias.

---

# 🟡 Medias

## 🟡 13. CORS completamente abierto

**Archivo:** `gateway/main.py`, configuración de `CORSMiddleware` (líneas ~24-29)

Se configura `allow_origins=["*"]` junto con `allow_credentials=True` y `allow_methods=["*"]`/`allow_headers=["*"]`. Esta combinación es una mala práctica: habilita que cualquier origen web pueda invocar la API (potencialmente con credenciales), eliminando la protección que el modelo de origen del navegador debería ofrecer.

**Impacto:** mayor superficie para ataques de tipo CSRF/uso indebido de la API desde sitios de terceros, especialmente si en el futuro se introduce autenticación basada en cookies.

**Solución:** restringir `allow_origins` a la(s) URL(s) reales del frontend en cada entorno (desarrollo/producción) en lugar de usar el comodín `*`.

---

## 🟡 14. Sin límite de intentos en el login

**Archivo:** `gateway/main.py`, endpoint `POST /auth/login` (líneas ~104-112) y `services/sauth/sauth_service.py`, función `op_login`

No existe ningún mecanismo de *rate limiting*, bloqueo temporal ni captcha tras varios intentos fallidos. El gateway reenvía cada intento directamente al servicio de autenticación sin restricción.

**Impacto:** facilita ataques de fuerza bruta o *credential stuffing* contra las cuentas de usuario.

**Solución:** añadir limitación de tasa de peticiones por IP/usuario en el gateway (o un proxy/API gateway delante de él), y bloqueo temporal de la cuenta tras varios intentos fallidos consecutivos.

---

## 🟡 15. Inconsistencia en el control de acceso por rol ("admin" inexistente)

**Archivos:** `services/sgast/sgast_service.py` (`listar_gastos`, comprobación `rol not in ["admin", "contador"]`, línea ~78) y `services/ssald/ssald_service.py` (`obtener_saldo_operario`, comprobación `rol_solicitante not in ["contador", "admin"]`, línea ~60); comparar con `services/sauth/sauth_service.py` donde `ROLES_VALIDOS = {"operario", "contador", "tecnico"}` (línea ~46)

Varios microservicios comparan el rol del usuario contra el valor `"admin"`, un rol que nunca puede existir realmente porque `sauth` solo permite crear usuarios con los roles `operario`, `contador` o `tecnico`. Esto indica que los controles de acceso entre servicios no están alineados ni se prueban de forma consistente; el rol `tecnico` (el de mayor privilegio real) queda excluido de esas comprobaciones, lo que hoy reduce el acceso, pero demuestra que las reglas de autorización fueron copiadas/modificadas sin verificación cruzada entre los componentes — un patrón de riesgo para futuras regresiones de seguridad.

**Impacto:** riesgo de que un cambio futuro en los roles introduzca accidentalmente una escalada o denegación de privilegios indebida; la inconsistencia es señal de falta de pruebas de autorización entre servicios.

**Solución:** centralizar la lista de roles válidos y las reglas de autorización (idealmente compartidas desde `services/shared/`), y agregar pruebas automatizadas que verifiquen que cada microservicio aplica las mismas reglas de rol que `sauth`.

---

## 🟡 16. Filtración de detalles internos en mensajes de error

**Archivos:** `services/sauth/sauth_service.py` (p. ej. `op_create_user`, línea ~228: `f"Error al crear usuario: {str(e)}"`), `services/ssald/ssald_service.py` y `services/srept/srept_service.py` (la mayoría de los `except Exception as e: return {"status": "error", "mensaje": str(e)}`)

Numerosas rutas devuelven el texto crudo de la excepción de Python (que puede incluir detalles de la consulta SQL, nombres de columnas, mensajes internos de la librería de Supabase, etc.) directamente al cliente final a través del gateway.

**Impacto:** divulgación de información interna del sistema (estructura de base de datos, librerías usadas, posibles rutas de archivo) que facilita a un atacante mapear la aplicación para ataques posteriores.

**Solución:** registrar el detalle completo del error solo en logs del servidor, y devolver al cliente mensajes genéricos y controlados (similar a como ya se hizo correctamente en `op_login`, que devuelve "Credenciales inválidas" en lugar del error real).

---

## 🟡 17. Política de contraseñas débil y sin validación en el servidor

**Archivos:** `frontend/src/CrearUsuario.tsx` (input con `minLength={6}`, línea ~129) y `services/sauth/sauth_service.py`, función `op_create_user` (líneas ~191-228)

El único requisito de contraseña es la longitud mínima de 6 caracteres, y se aplica exclusivamente en el atributo HTML del formulario (control de cliente, fácilmente evitable). El backend (`op_create_user`) crea el usuario en Supabase sin imponer ninguna política de complejidad, longitud mínima ni comprobación contra contraseñas comunes/filtradas.

**Impacto:** se permiten contraseñas débiles, aumentando el éxito de ataques de fuerza bruta o adivinación (agravado por la ausencia de rate limiting del hallazgo #14).

**Solución:** definir y aplicar una política de contraseñas robusta en el servidor (longitud mínima razonable, complejidad y/o verificación contra listas de contraseñas comprometidas) dentro del propio servicio de autenticación, sin depender de la validación del formulario.

---

## 🟡 18. El Service Worker cachea respuestas autenticadas (incluida información sensible)

**Archivo:** `frontend/public/sw.js`, manejador del evento `fetch` (líneas ~33-50)

El service worker aplica una estrategia "Network First" que, en **cada** petición exitosa, clona la respuesta y la guarda en la Cache Storage del navegador (`cache.put(event.request, responseToCache)`) sin ninguna exclusión. Esto significa que las respuestas de la API del gateway —listados de usuarios, saldos, gastos, e incluso peticiones cuyo token viaja en la query string (ver hallazgo #7)— quedan almacenadas en el dispositivo. En un equipo compartido, otra persona puede inspeccionar la Cache Storage y recuperar datos sensibles de la sesión anterior aunque el usuario haya cerrado sesión (el `localStorage.clear()` del logout no borra la Cache Storage).

**Impacto:** persistencia de datos sensibles (información de usuarios, montos, posiblemente tokens) en el navegador, recuperables tras el cierre de sesión, especialmente peligroso en dispositivos compartidos.

**Solución:** limitar el cacheo del service worker exclusivamente a recursos estáticos (HTML, JS, CSS, imágenes de la app) y excluir explícitamente las peticiones a la API/gateway y cualquier respuesta autenticada. Adicionalmente, limpiar la Cache Storage durante el cierre de sesión.

---

# 🔵 Bajas / Informativas

## 🔵 19. Tokens de sesión almacenados en `localStorage`

**Archivos:** `frontend/src/App.tsx` (líneas ~10-33), y uso repetido en `Operario.tsx`, `AdminView.tsx`, `TecnicoView.tsx`, `DirectorioUsuarios.tsx`, `CrearUsuario.tsx`, `expense-detail-modal.tsx` (`localStorage.getItem('scg_token')`)

El JWT de sesión se guarda en `localStorage`, accesible desde cualquier script que se ejecute en el contexto de la página. Aunque no se detectó actualmente ningún punto de inyección de HTML/JS (no se usa `dangerouslySetInnerHTML` ni `eval` en el código revisado), si en el futuro se introdujera una vulnerabilidad XSS, el atacante podría robar la sesión directamente leyendo `localStorage`.

**Impacto:** ampliación del impacto de un eventual XSS futuro, permitiendo robo de sesión persistente.

**Solución:** cuando sea posible, preferir cookies `httpOnly` y `secure` para el token de sesión en vez de almacenamiento accesible por JavaScript. Si se mantiene `localStorage`, reforzar la política de seguridad de contenido (CSP) y la disciplina de no introducir nunca render de HTML no confiable.

---

## 🔵 20. Posible saldo negativo no controlado

**Archivo:** `services/ssald/ssald_service.py`, función `cambiar_estado` (líneas ~96-110): `nuevo_saldo = saldo_actual - monto` y función `op_asignar_saldo` (líneas ~135-150)

Al aprobar un gasto, el saldo del operario se descuenta sin comprobar que el resultado no sea negativo. Tampoco se valida que el saldo asignado por el técnico (`op_asignar_saldo`) sea un valor no negativo.

**Impacto:** no es una vulnerabilidad de acceso, sino un problema de integridad de datos financieros que podría ser forzado si se aprueban gastos por montos mayores al saldo disponible (ver hallazgo #6).

**Solución:** validar en el backend que el saldo resultante nunca sea negativo (o definir explícitamente si se permite saldo negativo como parte del negocio) y validar que los saldos asignados manualmente sean valores no negativos.

---

## 🔵 21. Modo `--reload` de Uvicorn en la imagen de contenedor

**Archivo:** `gateway/Dockerfile` (línea `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]`)

La bandera `--reload` está pensada para desarrollo (vigila cambios en archivos y reinicia el proceso) y no debería usarse en una imagen que potencialmente se despliega en producción, ya que añade overhead y comportamiento no determinístico innecesario en un entorno expuesto.

**Impacto:** bajo directamente, pero es indicio de que la imagen de producción no está diferenciada de la de desarrollo, lo cual frecuentemente arrastra otras configuraciones inseguras (como las ya señaladas en CORS y exposición de puertos).

**Solución:** mantener un `Dockerfile`/comando de arranque distinto para producción, sin `--reload` y con un número fijo de workers apropiado.

---

## 🔵 22. Apertura de URLs provistas por el backend sin protección `noopener`

**Archivo:** `frontend/src/expense-detail-modal.tsx`, función `handleDownloadPDF` (línea ~66: `window.open(data.pdf_url, '_blank')`)

La aplicación abre en una nueva pestaña una URL recibida desde la respuesta del backend sin especificar `noopener`/`noreferrer`. Si esa URL llegara a ser controlable por un atacante (por ejemplo, derivada de datos de un comprobante manipulado), la página abierta obtendría una referencia a `window.opener` y podría intentar redirigir la pestaña original (*tabnabbing*), además de filtrar el `Referer`.

**Impacto:** bajo en el estado actual, pero habilita *reverse tabnabbing* si la URL pasa a ser influida por entradas no confiables.

**Solución:** abrir enlaces externos siempre con las opciones `noopener` y `noreferrer`, y validar que la URL pertenezca a un origen confiable antes de abrirla.

---

## 🔵 23. Credenciales de prueba hardcodeadas en los archivos de test

**Archivos:** `services/sauth/test_sauth.py` (líneas ~54, 62, 90, 103: `"password": "Test1234!"`), `services/srept/test_srept.py` (línea ~184) y correos de prueba en `services/sgast/test_sgast.py` (líneas ~101, 108)

Los scripts de prueba contienen contraseñas y correos fijos (`Test1234!`, `operario1@scg.cl`, etc.) usados para crear cuentas durante las pruebas. No son secretos de producción, pero si esos scripts se ejecutan contra una instancia real de Supabase, dejan cuentas con credenciales débiles y conocidas públicamente (el repositorio es público según el historial de git).

**Impacto:** bajo; riesgo de que queden cuentas de prueba con contraseñas conocidas en un entorno real si los tests se ejecutan contra producción.

**Solución:** generar credenciales de prueba aleatorias en tiempo de ejecución, ejecutar los tests únicamente contra un proyecto/entorno de Supabase desechable, y asegurarse de eliminar las cuentas creadas al finalizar.

---

## 🔵 24. Botones de aprobacion/rechazo visibles para usuarios sin permisos

**Archivo:** `frontend/src/expense-detail-modal.tsx`, bloque condicional de botones de auditoria (lineas ~155-173)

El modal de detalle de gasto muestra los botones "Aprobar" y "Rechazar" a **todos** los usuarios cuando el gasto esta en estado `pendiente`, sin verificar el rol del usuario logueado. Aunque el backend (`ssald`) rechaza correctamente la operacion si el usuario no es `contador` o `tecnico`, la interfaz expone funcionalidad administrativa a operarios, lo que genera confusion (el usuario intenta aprobar, recibe un error sin contexto claro) y viola el principio de minimo privilegio en la capa de presentacion.

**Impacto:** bajo en terminos de seguridad (el backend protege la operacion), pero constituye una quiebra de control de acceso en la interfaz y expone la existencia de funcionalidad administrativa a roles no autorizados, ademas de generar una mala experiencia de usuario.

**Solucion:** condicionar la renderizacion de los botones de aprobacion/rechazo al rol del usuario, mostrando los botones unicamente si el rol es `contador` (o `tecnico` si se desea). Esto puede verificarse leyendo `localStorage.getItem('scg_rol')` como pista de presentacion (la autorizacion real sigue siendo del backend).

---

## 🟡 25. Errores de tipo y rol fallback incorrecto en `ssald` causan fallo silencioso al aprobar gastos

**Archivos:** `services/ssald/ssald_service.py`, funciones `verificar_token` (linea ~37) y `cambiar_estado` (lineas ~116, 132)

El servicio de saldos presenta tres defectos que, combinados, provocan que la aprobacion de gastos por un contador falle con un error interno generico sin dejar rastro diagnosticable:

1. **Rol fallback incorrecto:** `verificar_token()` usa `"operador"` como valor por defecto si el perfil no tiene rol, pero el rol valido es `"operario"`. El valor `"operador"` no coincide con ninguno de los roles del sistema (`operario`, `contador`, `tecnico`), por lo que un usuario cuyo perfil no tenga rol asignado seria rechazado silenciosamente en todas las operaciones con un error de permisos inesperado.

2. **Incompatibilidad de tipos float/int en saldo:** Al aprobar un gasto, `nuevo_saldo = saldo_actual - monto` produce un valor `float` (porque `monto` en la tabla `gastos` es `NUMERIC`, que Supabase devuelve como `float`). Ese float se escribe en la columna `saldo_disponible` de tipo `BIGINT`, lo cual puede causar errores de tipo en la base de datos dependiendo de la version del cliente de Supabase.

3. **Excepcion tragada sin logging:** El bloque `except Exception` en `cambiar_estado` (linea 132) descarta la excepcion sin imprimirla ni registrarla, devolviendo solo un mensaje generico. Esto hace imposible diagnosticar la causa real del fallo desde los logs del contenedor.

**Impacto:** la funcionalidad central del sistema (aprobacion/rechazo de gastos por el contador) falla de forma silenciosa, bloqueando el flujo de trabajo de auditoria sin ofrecer informacion para depuracion.

**Solucion:** corregir el fallback del rol a `"operario"`, convertir el resultado de la resta de saldo a entero (`int()`) antes de escribir en la base de datos, y agregar logging de la excepcion real en el servidor (sin exponerla al cliente) para facilitar la depuracion.

---

## Nota sobre gestión de secretos (hallazgo no confirmado)

Se verificó el historial de git y **no se encontraron credenciales reales committeadas**: el archivo `.env` está correctamente listado en `.gitignore` y solo se versiona `.env.example` con valores de marcador (`tu_anon_key_aqui`). Esto es correcto y se documenta como aspecto positivo. No obstante, se reitera que la configuración de `docker-compose.yml` (hallazgo #3) reutiliza la misma clave para backend y frontend, lo que sigue siendo el riesgo principal en torno a secretos.

---

## Resumen de prioridades

| # | Hallazgo | Severidad |
|---|----------|-----------|
| 1 | Backdoor `test-token` en `sauth` | 🔴 Crítica |
| 2 | Bus sin autenticación y expuesto al host | 🔴 Crítica |
| 3 | Clave Supabase privilegiada expuesta al frontend | 🔴 Crítica |
| 4 | `scomp` sin verificación de identidad (IDOR) | 🟠 Alta |
| 5 | URL de comprobante no validada antes de borrar del storage | 🟠 Alta |
| 6 | Validación de saldo solo en el cliente | 🟠 Alta |
| 7 | Tokens en query string | 🟠 Alta |
| 8 | Control de acceso a vistas vía `localStorage` manipulable | 🟠 Alta |
| 9 | URL de comprobante no validada renderizada en navegador del contador | 🟠 Alta |
| 10 | Bucket de comprobantes público (datos sensibles sin auth) | 🟠 Alta |
| 11 | Dependencias del frontend con CVEs conocidos (vite, dompurify, esbuild) | 🟠 Alta |
| 12 | Dependencias innecesarias / riesgo de cadena de suministro (`postgres`, `expense`) | 🟠 Alta |
| 13 | CORS abierto (`*` + credentials) | 🟡 Media |
| 14 | Sin rate limiting en login | 🟡 Media |
| 15 | Roles inconsistentes entre servicios (`"admin"` inexistente) | 🟡 Media |
| 16 | Filtración de errores internos | 🟡 Media |
| 17 | Política de contraseñas débil y sin enforcement en servidor | 🟡 Media |
| 18 | Service Worker cachea respuestas autenticadas | 🟡 Media |
| 19 | Token en `localStorage` | 🔵 Baja |
| 20 | Saldo negativo no controlado | 🔵 Baja |
| 21 | `--reload` en imagen de gateway | 🔵 Baja |
| 22 | `window.open` de URL del backend sin `noopener` | 🔵 Baja |
| 23 | Credenciales de prueba hardcodeadas en tests | 🔵 Baja |
| 24 | Botones de aprobacion/rechazo visibles para usuarios sin permisos | 🔵 Baja |
| 25 | Errores de tipo, rol fallback incorrecto y falta de logging en `ssald` | 🟡 Media |

Se recomienda priorizar la corrección de los hallazgos 1, 2 y 3 de forma inmediata, ya que cualquiera de ellos por sí solo permite comprometer la totalidad del sistema y sus datos.
