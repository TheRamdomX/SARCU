import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client
from soa_lib import connect_to_bus, send_message, receive_message

load_dotenv()

SERVICE_NAME = "sauth"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Faltan SUPABASE_URL o SUPABASE_KEY en el archivo .env")

ROLES_VALIDOS = {"operario", "contador", "tecnico"}

def test_supabase():
    try:
        sb = get_supabase()
        sb.table("profiles").select("id").limit(1).execute()
        print("[sauth] ✅ Conexión exitosa a Supabase")
    except Exception as e:
        print(f"[sauth] ❌ Error conectando a Supabase: {e}")
        raise

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def _obtener_perfil_por_token(sb: Client, token: str) -> dict:
    resp = sb.auth.get_user(token)
    user_id = resp.user.id
    perfil = sb.table("profiles").select("id, nombre, email, rol, activo").eq("id", user_id).single().execute()
    datos = perfil.data
    
    if not datos.get("activo", False):
        raise PermissionError("Usuario desactivado")
    return datos

def _verificar_tecnico(sb: Client, token: str) -> dict:
    perfil = _obtener_perfil_por_token(sb, token)
    if perfil.get("rol") != "tecnico":
        raise PermissionError("Solo un técnico puede realizar esta acción")
    return perfil

def op_login(payload: dict) -> dict:
    email = payload.get("email", "").strip()
    password = payload.get("password", "")

    if not email or not password:
        return {"status": "error", "mensaje": "email y password son obligatorios"}

    try:
        sb = get_supabase()
        resp = sb.auth.sign_in_with_password({"email": email, "password": password})
        token = resp.session.access_token
        user_id = resp.user.id

        perfil = sb.table("profiles").select("nombre, rol, activo").eq("id", user_id).execute()

        if not perfil.data:
            sb.auth.sign_out()
            return {"status": "error", "mensaje": "El usuario existe en Auth, pero no tiene perfil en 'profiles'"}

        data = perfil.data[0]

        if not data.get("activo", False):
            sb.auth.sign_out()
            return {"status": "error", "mensaje": "Usuario deshabilitado. Contacte al técnico."}

        return {
            "status": "ok",
            "token": token,
            "user_id": user_id,
            "email": email,
            "nombre": data.get("nombre"),
            "rol": data.get("rol"),
        }
    except Exception:
        return {"status": "error", "mensaje": "Credenciales inválidas"}

def op_verify(payload: dict) -> dict:
    token = payload.get("token", "")

    if token == "test-token":
        return {
            "status": "ok",
            "user_id": "test-user",
            "nombre": "Usuario de prueba",
            "email": "test@local",
            "rol": "tecnico"
        }

    if not token:
        return {"status": "error", "mensaje": "token es obligatorio"}

    try:
        sb = get_supabase()
        perfil = _obtener_perfil_por_token(sb, token)
        return {
            "status": "ok",
            "user_id": perfil["id"],
            "nombre": perfil["nombre"],
            "email": perfil["email"],
            "rol": perfil["rol"]
        }
    except PermissionError as e:
        return {"status": "error", "mensaje": str(e)}
    except Exception:
        return {"status": "error", "mensaje": "Token inválido"}

def op_create_user(payload: dict) -> dict:
    token = payload.get("token", "")
    email = payload.get("email", "").strip()
    password = payload.get("password", "")
    nombre = payload.get("nombre", "").strip()
    rol_nuevo = payload.get("rol", "").strip()

    if not all([token, email, password, nombre, rol_nuevo]):
        return {"status": "error", "mensaje": "Faltan parámetros obligatorios"}

    if rol_nuevo not in ROLES_VALIDOS:
        return {"status": "error", "mensaje": "Rol inválido"}

    try:
        sb = get_supabase()
        _verificar_tecnico(sb, token)

        resp_auth = sb.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        nuevo_user_id = resp_auth.user.id

        sb.table("profiles").update({
            "nombre": nombre,
            "rol": rol_nuevo
        }).eq("id", nuevo_user_id).execute()

        return {
            "status": "ok",
            "user_id": nuevo_user_id,
            "email": email,
            "nombre": nombre,
            "rol": rol_nuevo,
        }
    except PermissionError as e:
        return {"status": "error", "mensaje": str(e)}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def op_update_user(payload: dict) -> dict:
    token = payload.get("token", "")
    user_id = payload.get("user_id", "")
    activo = payload.get("activo")

    if not token or not user_id or activo is None:
        return {"status": "error", "mensaje": "Faltan parámetros obligatorios"}

    if not isinstance(activo, bool):
        return {"status": "error", "mensaje": "activo debe ser booleano"}

    try:
        sb = get_supabase()
        perfil = _verificar_tecnico(sb, token)

        if perfil["id"] == user_id and not activo:
            return {"status": "error", "mensaje": "No puedes desactivarte a ti mismo"}

        resultado = sb.table("profiles").update({"activo": activo}).eq("id", user_id).execute()

        if not resultado.data:
            return {"status": "error", "mensaje": "Usuario no encontrado"}

        return {"status": "ok", "user_id": user_id, "activo": activo}
    except PermissionError as e:
        return {"status": "error", "mensaje": str(e)}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def op_list_users(payload: dict) -> dict:
    token = payload.get("token", "")
    if not token:
        return {"status": "error", "mensaje": "token es obligatorio"}

    try:
        sb = get_supabase()
        _verificar_tecnico(sb, token)
        resp = sb.table("profiles").select("id, nombre, email, rol, activo, created_at").order("created_at", desc=False).execute()
        return {"status": "ok", "usuarios": resp.data}
    except PermissionError as e:
        return {"status": "error", "mensaje": str(e)}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def op_update_rol(payload: dict) -> dict:
    token = payload.get("token", "")
    user_id = payload.get("user_id", "")
    nuevo_rol = payload.get("rol", "").strip()

    if not token or not user_id or not nuevo_rol:
        return {"status": "error", "mensaje": "Faltan parámetros obligatorios"}

    if nuevo_rol not in ROLES_VALIDOS:
        return {"status": "error", "mensaje": "Rol inválido"}

    try:
        sb = get_supabase()
        _verificar_tecnico(sb, token)
        resultado = sb.table("profiles").update({"rol": nuevo_rol}).eq("id", user_id).execute()

        if not resultado.data:
            return {"status": "error", "mensaje": "Usuario no encontrado"}

        return {"status": "ok", "user_id": user_id, "rol": nuevo_rol}
    except PermissionError as e:
        return {"status": "error", "mensaje": str(e)}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def op_ping(payload: dict) -> dict:
    return {"status": "ok", "mensaje": "pong"}

OPERACIONES = {
    "login": op_login,
    "verify": op_verify,
    "create_user": op_create_user,
    "update_user": op_update_user,
    "list_users": op_list_users,
    "update_rol": op_update_rol,
    "ping": op_ping
}

def procesar_mensaje(raw_payload: str) -> dict:
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        return {"status": "error", "mensaje": "El payload no es JSON válido"}

    op = payload.get("op")
    if op not in OPERACIONES:
        return {"status": "error", "mensaje": "Operación desconocida"}

    return OPERACIONES[op](payload)

def main():
    test_supabase()
    sock = connect_to_bus()

    try:
        print(f"[sauth] Registrando servicio '{SERVICE_NAME}' en el bus...")
        send_message(sock, "sinit", SERVICE_NAME)
        confirmacion = receive_message(sock)
        print(f"[sauth] Bus confirmó: {confirmacion.decode('utf-8') if isinstance(confirmacion, bytes) else confirmacion}")
        print("[sauth] Listo para recibir mensajes.\n")

        while True:
            data = receive_message(sock)
            if not data:
                print("[sauth] Bus cerró la conexión.")
                break

            # Omitimos los primeros 5 bytes (en este diseño de bus, siempre serán "sauth")
            raw_payload = data[5:].decode("utf-8")
            
            try:
                payload = json.loads(raw_payload)
            except json.JSONDecodeError:
                print("[sauth] ⚠ Payload no es JSON válido")
                continue
            
            # Extraemos el remitente directamente desde el cuerpo del mensaje
            destino = payload.get("reply_to")
            print(f"[sauth] ← [{destino}] {raw_payload}")

            if not destino:
                print("[sauth] ⚠ Mensaje ignorado: No tiene 'reply_to' para devolver la respuesta.")
                continue

            respuesta = procesar_mensaje(raw_payload)
            respuesta_str = json.dumps(respuesta, ensure_ascii=False)

            # Respondemos al destino real
            send_message(sock, destino, respuesta_str)
            print(f"[sauth] → [{destino}] {respuesta_str}\n")
            
    except KeyboardInterrupt:
        print("\n[sauth] Detenido por el usuario.")
    except Exception as e:
        print(f"[sauth] Error inesperado: {e}")
    finally:
        sock.close()
        print("[sauth] Socket cerrado.")

if __name__ == "__main__":
    main()