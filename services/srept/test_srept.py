import json, sys, os
sys.path.insert(0, '../shared')
from dotenv import load_dotenv
from supabase import create_client
from soa_lib import connect_to_bus, send_message, receive_message

load_dotenv()

GASTO_ID_PRUEBA = None   # se llena al crear la boleta de prueba


# ── Helpers ────────────────────────────────────────────────────────────────────

def llamar(sock, servicio: str, payload: dict) -> dict:
    # CORRECCIÓN: Siempre debemos inyectar nuestra dirección de retorno.
    # De lo contrario, el servicio destino se responde a sí mismo y el bus congela el mensaje.
    payload["reply_to"] = "tstre"
    send_message(sock, servicio, json.dumps(payload))
    data = receive_message(sock)
    return json.loads(data[5:].decode()) if data else {}

def titulo(txt):
    print(f"\n{'='*55}\n  {txt}\n{'='*55}")

def mostrar(resp, max_items=3):
    copia = dict(resp)
    for k, v in copia.items():
        if isinstance(v, list) and len(v) > max_items:
            copia[k] = v[:max_items] + [f"... +{len(v)-max_items} más"]
    print(f"  {json.dumps(copia, ensure_ascii=False, indent=2)}")


# ── Setup / Teardown directo en Supabase ───────────────────────────────────────

def crear_boleta_prueba(operario_id: str) -> str | None:
    """Inserta una boleta de prueba directamente en Supabase. Retorna el ID."""
    try:
        sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
        r  = sb.table("gastos").insert({
            "operario_id":    operario_id,
            "monto":          9990,
            "descripcion":    "[TEST] Boleta de prueba generada por test_srept.py",
            "fecha":          "2026-06-01",
            "estado":         "pendiente",
            "comprobante_url": "https://placehold.co/400x300?text=Boleta+Test",
        }).execute()

        if r.data:
            gasto_id = r.data[0]["id"]
            print(f"  ✓ Boleta de prueba creada: {gasto_id[:8]}...")
            return gasto_id
        return None
    except Exception as e:
        print(f"  ✗ No se pudo crear la boleta de prueba: {e}")
        return None


def eliminar_boleta_prueba(gasto_id: str):
    """Elimina la boleta de prueba directamente de Supabase."""
    try:
        sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
        sb.table("gastos").delete().eq("id", gasto_id).execute()
        print(f"  ✓ Boleta de prueba eliminada: {gasto_id[:8]}...")
    except Exception as e:
        print(f"  ✗ No se pudo eliminar la boleta de prueba: {e}")


# ── Tests ──────────────────────────────────────────────────────────────────────

def main():
    global GASTO_ID_PRUEBA

    sock = connect_to_bus()
    print("Conectado al bus.")
    
    # CORRECCIÓN: Registrar este cliente de prueba en el bus con un nombre de 5 letras
    send_message(sock, "sinit", "tstre")
    receive_message(sock) # Consumimos el OK del bus

    token_cont = None

    try:
        # 1. Login como contador
        titulo("1. Login contador")
        email = input("  Email contador:  ").strip()
        pwd   = input("  Password:        ").strip()
        r = llamar(sock, "sauth", {"op": "login", "email": email, "password": pwd})
        if r.get("status") != "ok" or r.get("rol") != "contador":
            print(f"  ✗ Falló o no es contador: {r.get('mensaje', r.get('rol'))}"); return
        token_cont  = r["token"]
        contador_id = r["user_id"]
        print(f"  ✓ Login ok. Rol: {r.get('rol')}")

        # 2. Crear boleta de prueba (usando el propio contador como operario_id)
        titulo("2. Crear boleta de prueba en Supabase")
        GASTO_ID_PRUEBA = crear_boleta_prueba(contador_id)
        if not GASTO_ID_PRUEBA:
            print("  ✗ No se puede continuar sin boleta de prueba."); return

        # 3. Resumen del dashboard
        titulo("3. Resumen general")
        mostrar(llamar(sock, "srept", {"op": "resumen", "token": token_cont}))

        # 4. Listar todos los gastos (debe aparecer la boleta de prueba)
        titulo("4. Listar todos los gastos")
        r = llamar(sock, "srept", {"op": "listar_gastos", "token": token_cont})
        print(f"  Total gastos: {r.get('total', 0)}")
        ids = [g["id"] for g in r.get("gastos", [])]
        assert GASTO_ID_PRUEBA in ids, "La boleta de prueba no aparece en el listado"
        print("  ✓ Boleta de prueba visible en el listado")

        # 5. Filtros combinados
        titulo("5. Filtrar: pendientes del último mes")
        r = llamar(sock, "srept", {
            "op": "listar_gastos", "token": token_cont,
            "estado": "pendiente", "fecha_filtro": "month"
        })
        print(f"  Pendientes último mes: {r.get('total', 0)}")

        # 6. Búsqueda por texto
        titulo("6. Buscar por texto '[TEST]'")
        r = llamar(sock, "srept", {
            "op": "listar_gastos", "token": token_cont,
            "search": "[TEST]"
        })
        print(f"  Resultados: {r.get('total', 0)}")

        # 7. Detalle de la boleta de prueba
        titulo("7. Detalle de la boleta de prueba")
        mostrar(llamar(sock, "srept", {
            "op": "detalle_gasto", "token": token_cont,
            "gasto_id": GASTO_ID_PRUEBA
        }))

        # 8. Aprobar la boleta de prueba
        titulo("8. Aprobar boleta de prueba")
        mostrar(llamar(sock, "srept", {
            "op": "aprobar_gasto", "token": token_cont,
            "gasto_id": GASTO_ID_PRUEBA
        }))

        # 9. Intentar aprobar la misma boleta de nuevo (debe fallar)
        titulo("9. Aprobar boleta ya aprobada (debe fallar)")
        mostrar(llamar(sock, "srept", {
            "op": "aprobar_gasto", "token": token_cont,
            "gasto_id": GASTO_ID_PRUEBA
        }))

        # 10. Crear segunda boleta para probar rechazo
        titulo("10. Crear segunda boleta y rechazarla")
        gasto_id_2 = crear_boleta_prueba(contador_id)
        if gasto_id_2:
            mostrar(llamar(sock, "srept", {
                "op": "rechazar_gasto", "token": token_cont,
                "gasto_id": gasto_id_2,
                "motivo": "Gasto personal, no corresponde a la empresa"
            }))
            eliminar_boleta_prueba(gasto_id_2)

        # 11. Rechazar sin motivo (debe fallar)
        titulo("11. Rechazar sin motivo (debe fallar)")
        gasto_id_3 = crear_boleta_prueba(contador_id)
        if gasto_id_3:
            mostrar(llamar(sock, "srept", {
                "op": "rechazar_gasto", "token": token_cont,
                "gasto_id": gasto_id_3, "motivo": ""
            }))
            eliminar_boleta_prueba(gasto_id_3)

        # 12. Datos para PDF
        titulo("12. Datos para reporte PDF")
        r = llamar(sock, "srept", {
            "op": "reporte_pdf", "token": token_cont,
            "gasto_ids": [GASTO_ID_PRUEBA]
        })
        print(f"  Gastos en PDF: {r.get('cantidad', 0)} | Total: ${r.get('total', 0):,.0f}")
        if r.get("gastos"):
            g = r["gastos"][0]
            print(f"  Campos PDF: {list(g.keys())}")

        # 13. Operario intenta usar srept (debe fallar)
        titulo("13. No-contador intenta listar gastos (debe fallar)")
        r_op = llamar(sock, "sauth", {
            "op": "login", "email": "operario1@scg.cl", "password": "Test1234!"
        })
        if r_op.get("status") == "ok":
            mostrar(llamar(sock, "srept", {
                "op": "listar_gastos", "token": r_op["token"]
            }))
        else:
            print("  (No hay operario de prueba disponible, saltando)")

    except KeyboardInterrupt:
        print("\n  Interrumpido.")
    finally:
        # Limpieza: eliminar la boleta de prueba principal
        if GASTO_ID_PRUEBA:
            titulo("🧹 Limpieza: eliminar boleta de prueba")
            eliminar_boleta_prueba(GASTO_ID_PRUEBA)

        sock.close()
        print("\nConexión cerrada.")

if __name__ == "__main__":
    main()