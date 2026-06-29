"""
Servicio de Gastos — SCG
Nombre en el bus: "sgast"
"""

import json
import os
import sys
from supabase import create_client

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../bus'))
from soa_lib import connect_to_bus, send_message, receive_message

SERVICE_NAME = "sgast"
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

supabase = None

def init_supabase():
    global supabase
    if not supabase:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return supabase

def verificar_token(token: str) -> dict | None:
    """Verifica el token directamente con Supabase para evitar cuellos de botella en el bus."""
    try:
        db = init_supabase()
        data = db.auth.get_user(token)
        if data.user:
            perfil = db.table("profiles").select("rol").eq("id", data.user.id).single().execute()
            if perfil.data:
                return {
                    "user_id": data.user.id,
                    "email": data.user.email,
                    "rol": perfil.data.get("rol", "operario")
                }
    except Exception as e:
        print(f"[{SERVICE_NAME}] Error verificando token: {e}")
    return None

def _validar_url_comprobante(url: str) -> bool:
    """Valida que la URL pertenezca al dominio Supabase y al bucket de comprobantes."""
    if not url:
        return True
    from urllib.parse import urlparse
    parsed = urlparse(url)
    supabase_domain = SUPABASE_URL.replace("https://", "").replace("http://", "")
    if supabase_domain not in parsed.netloc:
        return False
    if "/storage/v1/object/public/comprobantes/" not in url:
        return False
    return True


def crear_gasto(payload: dict, user_id: str, rol: str) -> dict:
    try:
        monto = payload.get("monto")
        concepto = payload.get("concepto", "").strip()
        fecha = payload.get("fecha")
        comprobante_url = payload.get("comprobanteUrl")

        if not all([monto, concepto, fecha]):
            return {"status": "error", "mensaje": "Faltan campos obligatorios (monto, concepto, fecha)."}

        if monto is not None and (not isinstance(monto, (int, float)) or monto <= 0):
            return {"status": "error", "mensaje": "El monto debe ser un número positivo."}

        if comprobante_url and not _validar_url_comprobante(comprobante_url):
            return {"status": "error", "mensaje": "URL de comprobante no válida."}

        db = init_supabase()

        perfil = db.table("profiles").select("saldo_disponible").eq("id", user_id).single().execute()
        saldo_disponible = perfil.data.get("saldo_disponible", 0) if perfil.data else 0
        if monto > saldo_disponible:
            return {"status": "error", "mensaje": f"El monto (${monto}) excede tu saldo disponible (${saldo_disponible})."}

        nuevo = {
            "operario_id": user_id,
            "monto": monto,
            "descripcion": concepto,
            "fecha": fecha,
            "comprobante_url": comprobante_url,
        }

        res = db.table("gastos").insert(nuevo).execute()

        if not res.data:
            return {"status": "error", "mensaje": "Error al guardar el gasto en la base de datos."}

        return {"status": "ok", "gasto": res.data[0]}
    except Exception:
        return {"status": "error", "mensaje": "Error interno al crear el gasto."}

def listar_gastos(payload: dict, user_id: str, rol: str) -> dict:
    try:
        db = init_supabase()
        query = db.table("gastos").select("*")

        if rol not in ["tecnico", "contador"]:
            query = query.eq("operario_id", user_id)

        estado = payload.get("estado")
        if estado and estado != "all":
            query = query.eq("estado", estado)

        # Ordenar para que las más nuevas salgan primero en el frontend
        query = query.order("created_at", desc=True)
        res = query.execute()

        return {"status": "ok", "gastos": res.data or []}
    except Exception:
        return {"status": "error", "mensaje": "Error interno al listar gastos."}

def procesar_mensaje(raw_payload: str) -> dict:
    try:
        payload = json.loads(raw_payload)
        op = payload.get("op")

        # Compatibilidad con los pings de test de otros microservicios
        if op == "ping":
            return {"status": "ok", "mensaje": "pong"}

        token = payload.get("token")
        usuario = verificar_token(token)
        if not usuario:
            return {"status": "error", "mensaje": "Token inválido o no proporcionado."}

        # Mapeo exacto de las operaciones que envía el Gateway HTTP
        if op == "crear":
            return crear_gasto(payload, usuario["user_id"], usuario["rol"])
        elif op == "listar":
            return listar_gastos(payload, usuario["user_id"], usuario["rol"])
        else:
            return {"status": "error", "mensaje": f"op '{op}' no soportada por {SERVICE_NAME}"}

    except Exception:
        return {"status": "error", "mensaje": "Error interno del servicio."}

def main():
    sock = connect_to_bus()
    try:
        print(f"[{SERVICE_NAME}] registrando...")
        send_message(sock, "sinit", f"{SERVICE_NAME}|{os.getenv('BUS_SECRET', '')}")
        confirmacion = receive_message(sock)
        print(f"[{SERVICE_NAME}] Bus confirmó: {confirmacion!r}")
        print(f"[{SERVICE_NAME}] listo y escuchando\n")

        while True:
            data = receive_message(sock)
            if not data:
                print(f"[{SERVICE_NAME}] conexión cerrada por el bus")
                break

            raw_payload = data[5:].decode("utf-8")
            print(f"[{SERVICE_NAME}] ← {raw_payload}")

            # Enrutamiento dinámico para evitar el "efecto boomerang"
            try:
                payload = json.loads(raw_payload)
                destino = payload.get("reply_to", SERVICE_NAME)
            except json.JSONDecodeError:
                destino = SERVICE_NAME

            respuesta = procesar_mensaje(raw_payload)
            respuesta["reply_to"] = destino

            respuesta_str = json.dumps(respuesta, ensure_ascii=False)
            send_message(sock, destino, respuesta_str)
            print(f"[{SERVICE_NAME}] → {respuesta_str}\n")

    except KeyboardInterrupt:
        print(f"\n[{SERVICE_NAME}] Detenido.")
    finally:
        sock.close()

if __name__ == "__main__":
    main()