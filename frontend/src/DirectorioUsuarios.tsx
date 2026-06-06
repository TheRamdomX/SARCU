import { useState, useEffect } from 'react';
import { Users, Shield, HardHat, Calculator, Activity } from 'lucide-react';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8000';

interface PerfilUsuario {
    id: string;
    email: string;
    nombre: string;
    rol: string;
    activo: boolean;
}

export default function DirectorioUsuarios() {
    const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        cargarUsuarios();
    }, []);

    const cargarUsuarios = async () => {
        try {
            setCargando(true);
            const token = localStorage.getItem('scg_token');
            const response = await fetch(`${GATEWAY_URL}/auth/usuarios?token=${token}`);
            const data = await response.json();

            if (data.status === 'ok') {
                setUsuarios(data.usuarios || []);
            } else {
                setError(data.mensaje || 'Error al cargar el directorio.');
            }
        } catch (err) {
            setError('Error de conexión con el servidor.');
        } finally {
            setCargando(false);
        }
    };

    const getRoleIcon = (rol: string) => {
        switch (rol) {
            case 'admin':
            case 'contador': return <Calculator className="h-4 w-4 text-purple-500" />;
            case 'tecnico': return <Shield className="h-4 w-4 text-emerald-500" />;
            default: return <HardHat className="h-4 w-4 text-amber-500" />;
        }
    };

    if (cargando) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 flex justify-center items-center">
                <Activity className="h-8 w-8 text-cyan-600 animate-spin" />
                <span className="ml-3 text-gray-500 font-medium">Sincronizando directorio...</span>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-gray-600" />
                    <h3 className="font-semibold text-gray-700">Directorio de Personal</h3>
                </div>
                <span className="bg-cyan-100 text-cyan-800 text-xs font-bold px-3 py-1 rounded-full">
                    {usuarios.length} Registros
                </span>
            </div>

            {error ? (
                <div className="p-6 text-center text-red-500 font-medium">{error}</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                                <th className="p-4">Nombre Completo</th>
                                <th className="p-4">Correo Electrónico</th>
                                <th className="p-4">Rol Asignado</th>
                                <th className="p-4 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {usuarios.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 font-medium text-gray-900">{user.nombre || 'Sin nombre'}</td>
                                    <td className="p-4 text-gray-600">{user.email}</td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2 capitalize text-gray-700">
                                            {getRoleIcon(user.rol)}
                                            {user.rol}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${user.activo !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {user.activo !== false ? 'ACTIVO' : 'INACTIVO'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}