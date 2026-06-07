"""
Servicio de Saldos — SCG
Nombre en el bus: "ssald" (exactamente 5 caracteres)
"""

import json
import os
import sys
from datetime import datetime, timezone
from supabase import create_client

# Importar desde bus/ del profesor
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../bus'))
from soa_lib import connect_to_bus, send_message, receive_message

SERVICE_NAME = "ssald"
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
supabase = None

def init_supabase():
    global supabase
    if not supabase:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return supabase

def verificar_token(token: str) -> dict | None:
    try:
        db = init_supabase()
        data = db.auth.get_user(token)
        if data.user:
            perfil = db.table("profiles").select("rol").eq("id", data.user.id).single().execute()
            if perfil.data:
                return {
                    "user_id": data.user.id,
                    "email": data.user.email,
                    "rol": perfil.data.get("rol", "operador")
                }
    except Exception as e:
        print(f"[{SERVICE_NAME}] Error verificando token: {e}")
    return None

def obtener_mi_saldo(user_id: str) -> dict:
    try:
        db = init_supabase()
        perfil = db.table("profiles").select("saldo_disponible").eq("id", user_id).single().execute()
        if perfil.data:
            return {
                "status": "ok",
                "saldo_disponible": perfil.data.get("saldo_disponible", 0)
            }
        else:
            return {"status": "error", "mensaje": "Perfil no encontrado"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def obtener_saldo_operario(user_id_solicitante: str, rol_solicitante: str, user_id_operario: str) -> dict:
    try:
        if rol_solicitante not in ["contador", "admin"]:
            return {
                "status": "error",
                "mensaje": f"Solo CONTADOR/ADMIN puede ver saldos. Tu rol es: {rol_solicitante}"
            }
        
        db = init_supabase()
        perfil = db.table("profiles").select("saldo_disponible, nombre, email, rol").eq("id", user_id_operario).single().execute()
        if perfil.data:
            return {
                "status": "ok",
                "saldo_disponible": perfil.data.get("saldo_disponible", 0),
                "nombre": perfil.data.get("nombre", ""),
                "email": perfil.data.get("email", ""),
                "rol": perfil.data.get("rol", "")
            }
        else:
            return {"status": "error", "mensaje": "Operario no encontrado"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def cambiar_estado(user_id_contador: str, rol_contador: str, gasto_id: str, nuevo_estado: str, motivo: str = "") -> dict:
    try:
        if rol_contador not in ["contador", "admin"]:
            return {"status": "error", "mensaje": "Sin permisos para cambiar estado de gastos."}
            
        db = init_supabase()
        nuevo_estado = nuevo_estado.lower().strip()
        if nuevo_estado not in ["aprobado", "rechazado"]:
            return {"status": "error", "mensaje": "Estado inválido."}
            
        if nuevo_estado == "rechazado" and not motivo.strip():
            return {"status": "error", "mensaje": "Motivo de rechazo es obligatorio."}
            
        gasto_res = db.table("gastos").select("*").eq("id", gasto_id).single().execute()
        if not gasto_res.data:
            return {"status": "error", "mensaje": "Gasto no encontrado"}
            
        gasto = gasto_res.data
        if gasto["estado"] != "pendiente":
            return {"status": "error", "mensaje": f"El gasto ya está {gasto['estado']}."}
            
        update_gasto = {
            "estado": nuevo_estado,
            "contador_id": user_id_contador,
            "fecha_revision": datetime.now(timezone.utc).isoformat(),
            "motivo_rechazo": motivo.strip() if nuevo_estado == "rechazado" else None
        }
            
        gasto_actualizado = db.table("gastos").update(update_gasto).eq("id", gasto_id).execute()
        
        if nuevo_estado == "aprobado":
            operario_id = gasto["operario_id"]
            monto = gasto["monto"]
            
            perfil_res = db.table("profiles").select("saldo_disponible").eq("id", operario_id).single().execute()
            saldo_actual = perfil_res.data.get("saldo_disponible", 0) if perfil_res.data else 0
            nuevo_saldo = saldo_actual - monto
            
            db.table("profiles").update({"saldo_disponible": nuevo_saldo}).eq("id", operario_id).execute()
            
            return {
                "status": "ok",
                "mensaje": f"Gasto APROBADO. Saldo deducido.",
                "saldo_anterior": saldo_actual,
                "saldo_nuevo": nuevo_saldo
            }
            
        return {"status": "ok", "mensaje": f"Gasto RECHAZADO. Motivo: {motivo.strip()}"}
        
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def op_asignar_saldo(user_id_solicitante: str, rol_solicitante: str, user_id_operario: str, saldo: float) -> dict:
    try:
        if rol_solicitante != "tecnico":
            return {"status": "error", "mensaje": "Solo un TÉCNICO puede asignar saldo."}
            
        # FORZAMOS la conversión a entero para evitar el error de bigint
        saldo_entero = int(saldo) 
            
        db = init_supabase()
        # Actualizamos el saldo
        res = db.table("profiles").update({"saldo_disponible": saldo_entero}).eq("id", user_id_operario).execute()
        
        if res.data:
            return {"status": "ok", "mensaje": "Saldo actualizado correctamente."}
        else:
            return {"status": "error", "mensaje": "No se pudo actualizar el saldo."}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}


def procesar_mensaje(raw_payload: str) -> dict:
    try:
        payload = json.loads(raw_payload)
        op = payload.get("op")
        token = payload.get("token")
        
        usuario_verificado = verificar_token(token)
        if not usuario_verificado:
            return {"status": "error", "mensaje": "Token inválido o expirado"}
            
        if op == "mi_saldo":
            return obtener_mi_saldo(usuario_verificado["user_id"])
        elif op == "saldo_operario":
            return obtener_saldo_operario(usuario_verificado["user_id"], usuario_verificado["rol"], payload.get("user_id"))
        elif op == "cambiar_estado":
            return cambiar_estado(usuario_verificado["user_id"], usuario_verificado["rol"], payload.get("gasto_id"), payload.get("estado"), payload.get("motivo", ""))
       
        elif op == "asignar_saldo":
            return op_asignar_saldo(usuario_verificado["user_id"], usuario_verificado["rol"], payload.get("user_id"), float(payload.get("saldo", 0)))
        
        else:
            return {"status": "error", "mensaje": f"Operación '{op}' no implementada"}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}

def main():
    sock = connect_to_bus()
    try:
        print(f"[{SERVICE_NAME}] Registrando servicio '{SERVICE_NAME}'...")
        send_message(sock, "sinit", SERVICE_NAME)
        confirmacion = receive_message(sock)
        print(f"[{SERVICE_NAME}] Bus confirmó: {confirmacion!r}")
        print(f"[{SERVICE_NAME}] Listo.\n")
        
        while True:
            data = receive_message(sock)
            if not data:
                break
                
            raw_payload = data[5:].decode("utf-8")
            print(f"[{SERVICE_NAME}] ← {raw_payload}")
            
            # CORRECCIÓN SOA: Evitar Loop y leer destino
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