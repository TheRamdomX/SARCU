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

def crear_gasto(payload: dict, user_id: str, rol: str) -> dict:
    try:
        monto = payload.get("monto")
        concepto = payload.get("concepto", "").strip()
        fecha = payload.get("fecha")
        foto_url = payload.get("comprobanteUrl")

        if not all([monto, concepto, fecha]):
            return {"status": "error", "mensaje": "Faltan campos obligatorios (monto, concepto, fecha)."}

        nuevo = {
            "operario_id": user_id,
            "monto": float(monto),
            "concepto": concepto,
            "fecha_creacion": fecha,
            "estado": "pendiente",
            "foto_url": foto_url
        }

        db = init_supabase()
        res = db.table("gastos").insert(nuevo).execute()

        if not res.data:
            return {"status": "error", "mensaje": "Error al guardar el gasto en la base de datos."}

        return {"status": "ok", "gasto": res.data[0]}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def listar_gastos(payload: dict, user_id: str, rol: str) -> dict:
    try:
        db = init_supabase()
        query = db.table("gastos").select("*")

        # Si no es admin ni contador, solo ve sus propias boletas
        if rol not in ["admin", "contador"]:
            query = query.eq("operario_id", user_id)

        estado = payload.get("estado")
        if estado and estado != "all":
            query = query.eq("estado", estado)

        # Ordenar para que las más nuevas salgan primero en el frontend
        query = query.order("fecha_creacion", desc=True)
        res = query.execute()

        return {"status": "ok", "gastos": res.data or []}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

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

    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def main():
    sock = connect_to_bus()
    try:
        print(f"[{SERVICE_NAME}] registrando...")
        send_message(sock, "sinit", SERVICE_NAME)
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