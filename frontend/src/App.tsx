import { useState, useEffect } from 'react';
import OperarioDashboard from './Operario';
import AdminView from './AdminView';
import { LoginForm } from './LoginForm';
import { loginSOA } from './lib/api';
import TecnicoView from './TecnicoView';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8000';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('scg_token'));
  const [rol, setRol] = useState<string | null>(null);
  const [cargando, setCargando] = useState(!!localStorage.getItem('scg_token'));
  const [vistaActiva, setVistaActiva] = useState<'admin' | 'operario'>('admin');

  useEffect(() => {
    const savedToken = localStorage.getItem('scg_token');
    if (savedToken) {
      verificarSesion(savedToken);
    }
  }, []);

  async function verificarSesion(tokenActual: string) {
    try {
      const res = await fetch(`${GATEWAY_URL}/auth/verify`, {
        headers: { 'Authorization': `Bearer ${tokenActual}` }
      });
      if (!res.ok) {
        localStorage.clear();
        setToken(null);
        setRol(null);
        return;
      }
      const data = await res.json();
      if (data.status === 'ok') {
        const rolVerificado = data.rol || 'operario';
        localStorage.setItem('scg_rol', rolVerificado);
        setRol(rolVerificado);
        setVistaActiva(rolVerificado === 'contador' ? 'admin' : 'operario');
      } else {
        localStorage.clear();
        setToken(null);
        setRol(null);
      }
    } catch {
      localStorage.clear();
      setToken(null);
      setRol(null);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (rol) {
      setVistaActiva(rol === 'contador' ? 'admin' : 'operario');
    }
  }, [rol]);

  const handleLogin = async (email: string, password: string) => {
    setCargando(true);
    try {
      const data = await loginSOA(email, password);
      
      if (data.token) {
        const userRole = data.rol || 'operario';
        
        // Guardamos los datos de la sesión SOA en el navegador
        localStorage.setItem('scg_token', data.token);
        localStorage.setItem('scg_rol', userRole);
        localStorage.setItem('scg_user_id', data.user_id);
        
        setToken(data.token);
        setRol(userRole);
      }
    } catch (error: any) {
      alert('Error al iniciar sesión mediante SOA: ' + error.message);
    } finally {
      setCargando(false);
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-cyan-600 font-medium">Autenticando en el sistema de servicios...</p>
      </div>
    );
  }

  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  const esAdministrador = rol === 'contador';

  if (esAdministrador && vistaActiva === 'admin') {
    return <AdminView onSwitchView={() => setVistaActiva('operario')} />;
  }

  if (rol === 'tecnico') {
    return <TecnicoView />;
  }

  if (esAdministrador && vistaActiva === 'operario') {
    return <OperarioDashboard onReturnToAdmin={() => setVistaActiva('admin')} />;
  }

  return <OperarioDashboard />;
}

export default App;