const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8000';

/**
 * Envía las credenciales al Gateway HTTP, el cual las traduce y consulta 
 * al microservicio sauth mediante sockets TCP en el bus central.
 */
export async function loginSOA(email: string, password: string) {
    const response = await fetch(`${GATEWAY_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error de autenticación o credenciales inválidas.');
    }

    // Retorna el payload del servicio sauth: { status, token, user_id, rol }
    return response.json();
}