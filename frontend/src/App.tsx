import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import OperarioDashboard from './Operario';
import AdminView from './AdminView';
import { LoginForm } from './LoginForm';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vistaActiva, setVistaActiva] = useState<'admin' | 'operario'>('admin');

  useEffect(() => {
    const fetchRol = async (userId: string) => {
      const { data, error } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setRol(data.rol);
        setVistaActiva(data.rol === 'admin' ? 'admin' : 'operario');
      }
      setCargando(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchRol(session.user.id);
      else setCargando(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setCargando(true);
        fetchRol(session.user.id);
      } else {
        setRol(null);
        setCargando(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      alert('Error al iniciar sesión: ' + error.message);
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-cyan-600 font-medium">Cargando plataforma...</p>
      </div>
    );
  }

  if (!session) {
    return <LoginForm onLogin={handleLogin} />;
  }

  if (rol === 'admin' && vistaActiva === 'admin') {
    return <AdminView onSwitchView={() => setVistaActiva('operario')} />;
  }

  if (rol === 'admin' && vistaActiva === 'operario') {
    return <OperarioDashboard onReturnToAdmin={() => setVistaActiva('admin')} />;
  }

  return <OperarioDashboard />;
}

export default App;