import { useState, useEffect } from 'react';
import OperarioDashboard from './Operario';
import AdminView from './AdminView';
import { LoginForm } from './LoginForm';
import { loginSOA } from './lib/api';
import TecnicoView from './TecnicoView';

function App() {
  // Inicializamos el estado leyendo directamente del almacenamiento local
  const [token, setToken] = useState<string | null>(localStorage.getItem('scg_token'));
  const [rol, setRol] = useState<string | null>(localStorage.getItem('scg_rol'));
  const [cargando, setCargando] = useState(false);
  const [vistaActiva, setVistaActiva] = useState<'admin' | 'operario'>('admin');

  useEffect(() => {
    if (rol) {
      // Si el rol es admin o contador, permitimos el acceso al panel administrativo
      setVistaActiva(rol === 'admin' || rol === 'contador' ? 'admin' : 'operario');
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

  const esAdministrador = rol === 'admin' || rol === 'contador';

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