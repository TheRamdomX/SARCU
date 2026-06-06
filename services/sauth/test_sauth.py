import json, sys
sys.path.insert(0, '../shared')
from soa_lib import connect_to_bus, send_message, receive_message

def llamar(sock, payload: dict) -> dict:
    # Inyectamos automáticamente la dirección de retorno para el bus
    payload["reply_to"] = "tst01"
    send_message(sock, "sauth", json.dumps(payload))
    data = receive_message(sock)
    return json.loads(data[5:].decode()) if data else {}

def titulo(txt):
    print(f"\n{'='*55}\n  {txt}\n{'='*55}")

def mostrar(resp):
    copia = {k: (v[:25] + "..." if k == "token" and isinstance(v, str) else v)
             for k, v in resp.items()}
    print(f"  {json.dumps(copia, ensure_ascii=False, indent=2)}")

def main():
    sock = connect_to_bus()
    print("Conectado al bus.")
    
    # --- REGISTRO EN EL BUS ---
    send_message(sock, "sinit", "tst01")
    receive_message(sock) # Consumir el OK del bus
    # --------------------------

    token_tec = None
    uid_op    = None

    try:
        # 1. Login técnico
        titulo("1. Login técnico")
        email = input("  Email técnico:  ").strip()
        pwd   = input("  Password:       ").strip()
        r = llamar(sock, {"op": "login", "email": email, "password": pwd})
        mostrar(r)
        
        if r.get("status") != "ok":
            print("   Login fallido. Revisar credenciales.")
            return
            
        token_tec = r["token"]
        print(f"  ✓ Rol: {r.get('rol')}")

        # 2. Verify
        titulo("2. Verify token")
        mostrar(llamar(sock, {"op": "verify", "token": token_tec}))

        # 3. Crear operario
        titulo("3. Crear usuario operario")
        r = llamar(sock, {"op": "create_user", "token": token_tec,
                          "email": "operario1@scg.cl", "password": "Test1234!",
                          "nombre": "Juan Operario", "rol": "operario"})
        mostrar(r)
        uid_op = r.get("user_id")

        # 4. Crear contador
        titulo("4. Crear usuario contador")
        r = llamar(sock, {"op": "create_user", "token": token_tec,
                          "email": "contador1@scg.cl", "password": "Test1234!",
                          "nombre": "María Contadora", "rol": "contador"})
        mostrar(r)
        uid_cont = r.get("user_id")

        # 5. Listar usuarios
        titulo("5. Listar usuarios")
        r = llamar(sock, {"op": "list_users", "token": token_tec})
        if r.get("status") == "ok":
            for u in r["usuarios"]:
                estado = "✓" if u["activo"] else "✗"
                print(f"  {estado} {u['nombre']:20} | {u['rol']:10} | {u['email']}")
        else:
            mostrar(r)

        # 6. Cambiar rol
        if uid_cont:
            titulo("6. Cambiar rol contador → operario (y revertir)")
            r = llamar(sock, {"op": "update_rol", "token": token_tec,
                              "user_id": uid_cont, "rol": "operario"})
            mostrar(r)
            llamar(sock, {"op": "update_rol", "token": token_tec,
                          "user_id": uid_cont, "rol": "contador"})
            print("  ✓ Revertido a contador")

        # 7. Operario intenta listar usuarios (debe fallar)
        titulo("7. Operario intenta list_users (debe dar error de permiso)")
        r_op = llamar(sock, {"op": "login",
                             "email": "operario1@scg.cl", "password": "Test1234!"})
        if r_op.get("status") == "ok":
            r = llamar(sock, {"op": "list_users", "token": r_op["token"]})
            mostrar(r)

        # 8. Desactivar operario
        if uid_op:
            titulo("8. Desactivar operario")
            mostrar(llamar(sock, {"op": "update_user", "token": token_tec,
                                  "user_id": uid_op, "activo": False}))

            titulo("9. Login con usuario desactivado (debe fallar)")
            mostrar(llamar(sock, {"op": "login",
                                  "email": "operario1@scg.cl", "password": "Test1234!"}))

        # 10. Técnico intenta desactivarse a sí mismo (debe fallar)
        titulo("10. Técnico intenta desactivarse a sí mismo (debe fallar)")
        uid_tec = llamar(sock, {"op": "verify", "token": token_tec}).get("user_id")
        if uid_tec:
            mostrar(llamar(sock, {"op": "update_user", "token": token_tec,
                                  "user_id": uid_tec, "activo": False}))

    except KeyboardInterrupt:
        print("\n  Interrumpido.")
    finally:
        sock.close()
        print("\nConexión cerrada.")

if __name__ == "__main__":
    main()