import { useState } from 'react';
import { LogIn, User, Lock, Wallet } from 'lucide-react';
import { Button } from './button';


interface LoginFormProps {
  onLogin: (email: string, password: string) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Por favor ingresa tu correo electrónico');
      return;
    }

    if (!password.trim()) {
      setError('Por favor ingresa tu contraseña');
      return;
    }

    onLogin(email.trim(), password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-white flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 text-white p-6 pb-12 rounded-b-3xl shadow-lg">
        <div className="flex flex-col items-center justify-center mt-8">
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 mb-4">
            <Wallet className="h-12 w-12" />
          </div>
          <h1 className="text-2xl mb-2">Registro de Gastos</h1>
          <p className="text-cyan-100 text-sm">Reporta tus gastos en terreno</p>
        </div>
      </div>

      {/* Login Form */}
      <div className="flex-1 p-6">
        <div className="max-w-md mx-auto mt-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-cyan-100">
            <h2 className="text-xl mb-6 text-gray-800">Inicio de Sesión</h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div>
                <label htmlFor="email" className="block text-sm mb-2 text-gray-700">
                  Correo electrónico
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-600">
                    <User className="h-5 w-5" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="tu@email.com"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label htmlFor="password" className="block text-sm mb-2 text-gray-700">
                  Contraseña
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-600">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-cyan-600 hover:bg-cyan-700 py-6 rounded-xl text-base"
              >
                <LogIn className="h-5 w-5 mr-2" />
                Ingresar
              </Button>
            </form>

            {/* Help Text */}
            <div className="mt-6 text-center">
              <button
                type="button"
                className="text-sm text-cyan-600 hover:text-cyan-700"
                onClick={() => alert('Contacta al administrador del sistema')}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </div>

          {/* Footer Note */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Acceso exclusivo para trabajadores autorizados</p>
          </div>
        </div>
      </div>
    </div>
  );
}
