import json
import time
import os
from supabase import create_client
from soa_lib import connect_to_bus, send_message, receive_message
SERVICE_NAME = "scomp"

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET = "comprobantes"


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

SUPABASE_STORAGE_DOMAIN = os.environ.get("SUPABASE_URL", "").replace("https://", "").replace("http://", "")


def _validar_url_comprobante(url: str) -> bool:
    """Valida que la URL pertenezca al bucket de comprobantes del proyecto Supabase."""
    if not url:
        return False
    from urllib.parse import urlparse
    parsed = urlparse(url)
    if not SUPABASE_STORAGE_DOMAIN or SUPABASE_STORAGE_DOMAIN not in parsed.netloc:
        return False
    if f"/storage/v1/object/public/{BUCKET}/" not in url:
        return False
    return True


def _get_perfil(user_id: str) -> dict | None:
    res = supabase.table("profiles").select("rol").eq("id", user_id).single().execute()
    return res.data


# ─────────────────────────────────────────────
# OPERACIONES DE COMPROBANTES
# ─────────────────────────────────────────────

def subir_comprobante(payload: dict, user_id: str) -> dict:
    """
    Registra la URL del comprobante ya subido por el frontend.
    user_id proviene del token verificado, no del payload.
    """
    gasto_id = payload.get("gasto_id")
    url      = payload.get("url", "").strip()

    perfil = _get_perfil(user_id)
    if not perfil or perfil["rol"] not in ("operario",):
        return {"status": "error", "mensaje": "Solo operarios pueden subir comprobantes"}
    if not gasto_id or not url:
        return {"status": "error", "mensaje": "Faltan campos: gasto_id, url"}

    if not _validar_url_comprobante(url):
        return {"status": "error", "mensaje": "URL de comprobante no válida"}

    # Verificar que el gasto pertenece al operario y está pendiente
    res = supabase.table("gastos").select("operario_id,estado").eq("id", gasto_id).single().execute()
    if not res.data:
        return {"status": "error", "mensaje": "Gasto no encontrado"}

    gasto = res.data
    if gasto["operario_id"] != user_id:
        return {"status": "error", "mensaje": "No tienes permiso sobre este gasto"}
    if gasto["estado"] != "pendiente":
        return {"status": "error", "mensaje": "Solo se puede adjuntar a gastos pendientes"}

    supabase.table("gastos").update({"comprobante_url": url}).eq("id", gasto_id).execute()

    return {"status": "ok", "url": url, "gasto_id": gasto_id}


def obtener_url(payload: dict, user_id: str) -> dict:
    """
    Devuelve la URL del comprobante de un gasto.
    user_id proviene del token verificado.
    """
    gasto_id = payload.get("gasto_id")

    if not _get_perfil(user_id):
        return {"status": "error", "mensaje": "Usuario no encontrado"}

    res = supabase.table("gastos").select("comprobante_url,estado").eq("id", gasto_id).single().execute()
    if not res.data:
        return {"status": "error", "mensaje": "Gasto no encontrado"}

    url = res.data.get("comprobante_url")
    if not url:
        return {"status": "error", "mensaje": "Este gasto no tiene comprobante adjunto"}

    return {"status": "ok", "url": url}


def vincular_comprobante(payload: dict, user_id: str) -> dict:
    """Vincula una URL ya existente en Storage a un gasto."""
    return subir_comprobante(payload, user_id)


def eliminar_comprobante(payload: dict, user_id: str) -> dict:
    """
    Elimina el comprobante del bucket y limpia la URL en el gasto.
    user_id proviene del token verificado.
    """
    gasto_id = payload.get("gasto_id")

    perfil = _get_perfil(user_id)
    if not perfil or perfil["rol"] != "operario":
        return {"status": "error", "mensaje": "Solo operarios pueden eliminar comprobantes"}

    res = supabase.table("gastos").select("operario_id,estado,comprobante_url").eq("id", gasto_id).single().execute()
    if not res.data:
        return {"status": "error", "mensaje": "Gasto no encontrado"}

    gasto = res.data
    if gasto["operario_id"] != user_id:
        return {"status": "error", "mensaje": "No tienes permiso sobre este gasto"}
    if gasto["estado"] != "pendiente":
        return {"status": "error", "mensaje": "No se puede modificar un gasto ya revisado"}

    url = gasto.get("comprobante_url")
    if not url:
        return {"status": "error", "mensaje": "Este gasto no tiene comprobante"}

    if not _validar_url_comprobante(url):
        return {"status": "error", "mensaje": "URL de comprobante almacenada no es válida"}

    try:
        path = url.split(f"/object/public/{BUCKET}/")[-1]
        supabase.storage.from_(BUCKET).remove([path])
    except Exception:
        return {"status": "error", "mensaje": "Error al eliminar del storage"}

    # Limpiar URL en la tabla
    supabase.table("gastos").update({"comprobante_url": None}).eq("id", gasto_id).execute()

    return {"status": "ok", "mensaje": "Comprobante eliminado"}

def esperar_respuesta(sock, esperado_reply_to: str, timeout=10):
    start = time.time()

    while True:
        if time.time() - start > timeout:
            return None

        resp = receive_message(sock)
        if not resp:
            continue

        try:
            data = json.loads(resp[5:].decode())

            if data.get("reply_to") == esperado_reply_to:
                return data

        except Exception:
            continue


def verificar_token(sock, token: str) -> dict:
    request = {
        "op": "verify",
        "token": token,
        "reply_to": SERVICE_NAME
    }

    send_message(sock, "sauth", json.dumps(request))

    respuesta = esperar_respuesta(sock, SERVICE_NAME)

    if not respuesta:
        return {"status": "error", "mensaje": "sauth no respondió"}

    return respuesta


def procesar_mensaje(sock, raw_payload: str) -> dict:
    try:
        payload = json.loads(raw_payload)
        op = payload.get("op")

        if op == "ping":
            return {"status": "ok", "mensaje": "pong"}

        token = payload.get("token")
        if not token:
            return {"status": "error", "mensaje": "Token es obligatorio"}

        auth_result = verificar_token(sock, token)
        if auth_result.get("status") != "ok":
            return {"status": "error", "mensaje": "Token inválido o expirado"}

        user_id = auth_result.get("user_id")

        if op == "subir_comprobante":
            return subir_comprobante(payload, user_id)
        if op == "obtener_url":
            return obtener_url(payload, user_id)
        if op == "vincular_comprobante":
            return vincular_comprobante(payload, user_id)
        if op == "eliminar_comprobante":
            return eliminar_comprobante(payload, user_id)

        return {"status": "error", "mensaje": f"op '{op}' no soportada"}

    except Exception:
        return {"status": "error", "mensaje": "Error interno del servicio"}


def main():
    sock = connect_to_bus()

    print("[scomp] registrando...")
    send_message(sock, "sinit", f"{SERVICE_NAME}|{os.getenv('BUS_SECRET', '')}")
    receive_message(sock)

    print("[scomp] listo y escuchando")

    while True:
        print("[scomp] esperando mensajes...")

        data = receive_message(sock)

        if not data:
            print("[scomp] conexión cerrada")
            break

        raw_payload = data[5:].decode()
        print(f"[scomp] recibido: {raw_payload}")

        respuesta = procesar_mensaje(sock, raw_payload)

        send_message(sock, SERVICE_NAME, json.dumps(respuesta))
        print(f"[scomp] enviado: {respuesta}")


if __name__ == "__main__":
    main()