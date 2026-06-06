import os
import json
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
from soa_lib import connect_to_bus, send_message, receive_message

load_dotenv()

# ── Configuración ──────────────────────────────────────────────────────────────
SERVICE_NAME = "srept"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Faltan SUPABASE_URL o SUPABASE_KEY en el archivo .env")

# ── Helpers ────────────────────────────────────────────────────────────────────

def test_supabase():
    try:
        sb = get_supabase()
        sb.table("gastos").select("id").limit(1).execute()
        print("[srept] ✅ Conexión exitosa a Supabase")
    except Exception as e:
        print(f"[srept] ❌ Error conectando a Supabase: {e}")
        raise

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def _verificar_contador(sb: Client, token: str) -> dict:
    resp = sb.auth.get_user(token)
    user_id = resp.user.id
    result = sb.table("profiles").select("id, nombre, rol, activo").eq("id", user_id).execute()
    
    if not result.data:
        raise PermissionError("Usuario no encontrado")
        
    perfil = result.data[0]
    if not perfil.get("activo"):
        raise PermissionError("Usuario desactivado")
    if perfil.get("rol") != "contador":
        raise PermissionError("Solo el contador puede realizar esta acción")
    return perfil

def _aplicar_filtro_fecha(query, fecha_filtro: str):
    ahora = datetime.now(timezone.utc)
    if fecha_filtro == "today":
        desde = ahora.replace(hour=0, minute=0, second=0).isoformat()
        query = query.gte("created_at", desde)
    elif fecha_filtro == "week":
        desde = (ahora - timedelta(days=7)).isoformat()
        query = query.gte("created_at", desde)
    elif fecha_filtro == "month":
        desde = (ahora - timedelta(days=30)).isoformat()
        query = query.gte("created_at", desde)
    elif fecha_filtro == "3months":
        desde = (ahora - timedelta(days=90)).isoformat()
        query = query.gte("created_at", desde)
    return query

def _aplicar_filtro_monto(query, monto_filtro: str):
    rangos = {
        "0-5000": (0, 5000), "5000-10000": (5000, 10000),
        "10000-20000": (10000, 20000), "20000-50000": (20000, 50000),
        "50000+": (50000, None),
    }
    if monto_filtro in rangos:
        minimo, maximo = rangos[monto_filtro]
        query = query.gte("monto", minimo)
        if maximo is not None:
            query = query.lte("monto", maximo)
    return query

def _inyectar_perfiles(sb: Client, gastos: list) -> list:
    """Busca los perfiles involucrados y los inyecta simulando el JOIN de Supabase"""
    if not gastos:
        return []
        
    ids_buscar = set()
    for g in gastos:
        if g.get("operario_id"): ids_buscar.add(g.get("operario_id"))
        if g.get("contador_id"): ids_buscar.add(g.get("contador_id"))
        
    if not ids_buscar:
        return gastos
        
    resp = sb.table("profiles").select("id, nombre, email").in_("id", list(ids_buscar)).execute()
    mapa_perfiles = {p["id"]: p for p in resp.data}
    
    for g in gastos:
        g["operario"] = mapa_perfiles.get(g.get("operario_id")) or {}
        g["contador"] = mapa_perfiles.get(g.get("contador_id")) or {}
        
    return gastos

def _formatear_gasto(g: dict) -> dict:
    operario = g.get("operario") or {}
    contador = g.get("contador") or {}
    return {
        "id": g.get("id"), "monto": g.get("monto"), "descripcion": g.get("descripcion"),
        "fecha": g.get("fecha"), "estado": g.get("estado"), "comprobante_url": g.get("comprobante_url"),
        "motivo_rechazo": g.get("motivo_rechazo"), "fecha_revision": g.get("fecha_revision"),
        "created_at": g.get("created_at"), "operario_id": g.get("operario_id"),
        "operario_nombre": operario.get("nombre", "Desconocido"), "operario_email": operario.get("email", ""),
        "contador_id": g.get("contador_id"), "contador_nombre": contador.get("nombre", ""),
    }

# ── Operaciones ────────────────────────────────────────────────────────────────

def op_listar_gastos(payload: dict) -> dict:
    token = payload.get("token", "")
    reply_to = payload.get("reply_to")
    estado = payload.get("estado", "all")
    fecha_filtro = payload.get("fecha_filtro", "all")
    monto_filtro = payload.get("monto_filtro", "all")
    search = payload.get("search", "").strip()

    try:
        sb = get_supabase()
        _verificar_contador(sb, token)

        query = sb.table("gastos").select("*")
        if estado and estado != "all":
            query = query.eq("estado", estado)
        if search:
            query = query.ilike("descripcion", f"%{search}%")

        query = _aplicar_filtro_fecha(query, fecha_filtro)
        query = _aplicar_filtro_monto(query, monto_filtro)
        resultado = query.order("created_at", desc=True).execute()

        gastos_completos = _inyectar_perfiles(sb, resultado.data)
        gastos = [_formatear_gasto(g) for g in gastos_completos]

        return {"status": "ok", "gastos": gastos, "total": len(gastos), "reply_to": reply_to}
    except Exception as e:
        return {"status": "error", "mensaje": str(e), "reply_to": reply_to}

def op_detalle_gasto(payload: dict) -> dict:
    token = payload.get("token", "")
    gasto_id = payload.get("gasto_id", "")
    reply_to = payload.get("reply_to")

    if not gasto_id:
        return {"status": "error", "mensaje": "gasto_id obligatorio", "reply_to": reply_to}

    try:
        sb = get_supabase()
        _verificar_contador(sb, token)
        resultado = sb.table("gastos").select("*").eq("id", gasto_id).execute()

        if not resultado.data:
            return {"status": "error", "mensaje": "Gasto no encontrado", "reply_to": reply_to}

        gastos_completos = _inyectar_perfiles(sb, resultado.data)
        return {"status": "ok", "gasto": _formatear_gasto(gastos_completos[0]), "reply_to": reply_to}
    except Exception as e:
        return {"status": "error", "mensaje": str(e), "reply_to": reply_to}

def op_aprobar_gasto(payload: dict) -> dict:
    token = payload.get("token", "")
    gasto_id = payload.get("gasto_id", "")
    reply_to = payload.get("reply_to")

    if not gasto_id:
        return {"status": "error", "mensaje": "gasto_id es obligatorio", "reply_to": reply_to}

    try:
        sb = get_supabase()
        perfil = _verificar_contador(sb, token)
        actual = sb.table("gastos").select("estado").eq("id", gasto_id).execute()
        
        if not actual.data:
            return {"status": "error", "mensaje": "Gasto no encontrado", "reply_to": reply_to}
        if actual.data[0]["estado"] != "pendiente":
            return {"status": "error", "mensaje": f"El gasto ya fue {actual.data[0]['estado']}", "reply_to": reply_to}

        sb.table("gastos").update({
            "estado": "aprobado", "contador_id": perfil["id"],
            "fecha_revision": datetime.now(timezone.utc).isoformat(), "motivo_rechazo": None,
        }).eq("id", gasto_id).execute()

        return {"status": "ok", "gasto_id": gasto_id, "estado": "aprobado", "reply_to": reply_to}
    except Exception as e:
        return {"status": "error", "mensaje": str(e), "reply_to": reply_to}

def op_rechazar_gasto(payload: dict) -> dict:
    token = payload.get("token", "")
    gasto_id = payload.get("gasto_id", "")
    motivo = payload.get("motivo", "").strip()
    reply_to = payload.get("reply_to")

    if not gasto_id or not motivo:
        return {"status": "error", "mensaje": "gasto_id y motivo son obligatorios", "reply_to": reply_to}

    try:
        sb = get_supabase()
        perfil = _verificar_contador(sb, token)
        actual = sb.table("gastos").select("estado").eq("id", gasto_id).execute()
        
        if not actual.data:
            return {"status": "error", "mensaje": "Gasto no encontrado", "reply_to": reply_to}
        if actual.data[0]["estado"] != "pendiente":
            return {"status": "error", "mensaje": f"El gasto ya fue {actual.data[0]['estado']}", "reply_to": reply_to}

        sb.table("gastos").update({
            "estado": "rechazado", "contador_id": perfil["id"],
            "fecha_revision": datetime.now(timezone.utc).isoformat(), "motivo_rechazo": motivo,
        }).eq("id", gasto_id).execute()

        return {"status": "ok", "gasto_id": gasto_id, "estado": "rechazado", "motivo": motivo, "reply_to": reply_to}
    except Exception as e:
        return {"status": "error", "mensaje": str(e), "reply_to": reply_to}

def op_resumen(payload: dict) -> dict:
    token = payload.get("token", "")
    reply_to = payload.get("reply_to")

    try:
        sb = get_supabase()
        _verificar_contador(sb, token)
        todos = sb.table("gastos").select("monto, estado").execute()
        gastos = todos.data or []

        pendientes = [g for g in gastos if g["estado"] == "pendiente"]
        aprobados = [g for g in gastos if g["estado"] == "aprobado"]
        rechazados = [g for g in gastos if g["estado"] == "rechazado"]

        return {
            "status": "ok",
            "resumen": {
                "total_gastos": len(gastos), "total_monto": sum(g["monto"] for g in gastos),
                "pendientes": len(pendientes), "monto_pendiente": sum(g["monto"] for g in pendientes),
                "aprobados": len(aprobados), "monto_aprobado": sum(g["monto"] for g in aprobados),
                "rechazados": len(rechazados), "monto_rechazado": sum(g["monto"] for g in rechazados),
            },
            "reply_to": reply_to,
        }
    except Exception as e:
        return {"status": "error", "mensaje": str(e), "reply_to": reply_to}

def op_reporte_pdf(payload: dict) -> dict:
    token = payload.get("token", "")
    gasto_ids = payload.get("gasto_ids", [])
    reply_to = payload.get("reply_to")

    try:
        sb = get_supabase()
        _verificar_contador(sb, token)
        query = sb.table("gastos").select("*")

        if gasto_ids:
            query = query.in_("id", gasto_ids)
        else:
            query = query.eq("estado", "aprobado")

        resultado = query.order("created_at", desc=True).execute()
        gastos_completos = _inyectar_perfiles(sb, resultado.data)

        gastos_pdf = [
            {
                "id": g["id"], "workerName": (g.get("operario") or {}).get("nombre", "Desconocido"),
                "workerId": g.get("operario_id"), "concept": g.get("descripcion"),
                "amount": g.get("monto"), "photo": g.get("comprobante_url", ""),
                "date": g.get("created_at"), "estado": g.get("estado"),
            }
            for g in gastos_completos
        ]
        return {
            "status": "ok", "gastos": gastos_pdf, "total": sum(g["amount"] for g in gastos_pdf),
            "cantidad": len(gastos_pdf), "reply_to": reply_to,
        }
    except Exception as e:
        return {"status": "error", "mensaje": str(e), "reply_to": reply_to}

# ── Dispatcher ─────────────────────────────────────────────────────────────────

OPERACIONES = {
    "listar_gastos": op_listar_gastos, "detalle_gasto": op_detalle_gasto,
    "aprobar_gasto": op_aprobar_gasto, "rechazar_gasto": op_rechazar_gasto,
    "resumen": op_resumen, "reporte_pdf": op_reporte_pdf,
}

def procesar_mensaje(raw_payload: str) -> dict:
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        return {"status": "error", "mensaje": "Payload no es JSON válido"}

    op = payload.get("op")
    if op not in OPERACIONES:
        return {"status": "error", "mensaje": f"Operación desconocida: {op}"}

    return OPERACIONES[op](payload)

def main():
    test_supabase()
    sock = connect_to_bus()
    try:
        print(f"[{SERVICE_NAME}] Registrando en el bus...")
        send_message(sock, "sinit", SERVICE_NAME)
        confirm = receive_message(sock)
        print(f"[{SERVICE_NAME}] Bus confirmó: {confirm!r}")
        print(f"[{SERVICE_NAME}] Listo. Esperando mensajes...\n")

        while True:
            data = receive_message(sock)
            if not data:
                break
            raw_payload = data[5:].decode("utf-8")
            print(f"[{SERVICE_NAME}] ← {raw_payload}")

            payload = json.loads(raw_payload)
            destino = payload.get("reply_to", SERVICE_NAME)
            respuesta = procesar_mensaje(raw_payload)

            send_message(sock, destino, json.dumps(respuesta, ensure_ascii=False))
            print(f"[{SERVICE_NAME}] → {json.dumps(respuesta, ensure_ascii=False)}\n")

    except KeyboardInterrupt:
        print(f"\n[{SERVICE_NAME}] Detenido.")
    except Exception as e:
        print(f"[{SERVICE_NAME}] Error: {e}")
    finally:
        sock.close()

if __name__ == "__main__":
    main()