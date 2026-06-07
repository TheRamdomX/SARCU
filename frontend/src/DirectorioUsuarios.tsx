import { useState, useEffect } from 'react';
import { Users, Shield, HardHat, Calculator, Activity, Pencil, Trash2, X, DollarSign } from 'lucide-react';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8000';

interface PerfilUsuario {
    id: string;
    email: string;
    nombre: string;
    rol: string;
    activo: boolean;
    saldo_disponible?: number; // Agregado para poder editarlo
}

export default function DirectorioUsuarios() {
    const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    // --- ESTADOS PARA EL MODAL DE EDICIÓN ---
    const [usuarioAEditar, setUsuarioAEditar] = useState<any>(null);
    const [guardando, setGuardando] = useState(false);

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

    // --- FUNCIÓN PARA ELIMINAR ---
    const handleEliminar = async (id: string, nombre: string) => {
        if (!window.confirm(`¿Estás seguro de que deseas eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;

        try {
            const token = localStorage.getItem('scg_token');
            // Necesitarás crear esta ruta DELETE en tu Gateway
            const res = await fetch(`${GATEWAY_URL}/usuarios/${id}?token=${token}`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (data.status === 'ok') {
                cargarUsuarios();
            } else {
                alert('Error: ' + (data.detail || data.mensaje || 'Error desconocido'));
            }
        } catch (error) {
            alert('Error de conexión al intentar eliminar.');
        }
    };

    // --- FUNCIONES PARA MODIFICAR ---
    const abrirModalEdicion = (usuario: PerfilUsuario) => {
        setUsuarioAEditar({
            ...usuario,
            saldo_disponible: usuario.saldo_disponible || 0 
        });
    };

    const handleGuardarEdicion = async (e: React.FormEvent) => {
        e.preventDefault();
        setGuardando(true);

        try {
            const token = localStorage.getItem('scg_token');
            // Necesitarás crear esta ruta PATCH en tu Gateway
            const res = await fetch(`${GATEWAY_URL}/usuarios/${usuarioAEditar.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: token,
                    rol: usuarioAEditar.rol,
                    saldo_disponible: parseFloat(usuarioAEditar.saldo_disponible)
                })
            });

            const data = await res.json();
            
            if (data.status === 'ok') {
                setUsuarioAEditar(null);
                cargarUsuarios();
            } else {
                alert('Error al actualizar: ' + (data.detail || data.mensaje || 'Error desconocido'));
            }
        } catch (error) {
            alert('Error al comunicarse con el servidor.');
        } finally {
            setGuardando(false);
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
                                <th className="p-4 text-right">Acciones</th>
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
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        <button 
                                            onClick={() => abrirModalEdicion(user)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Modificar Usuario"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleEliminar(user.id, user.nombre)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Eliminar Usuario"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* --- VENTANA MODAL DE EDICIÓN --- */}
            {usuarioAEditar && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-semibold text-gray-800 text-lg">Modificar Usuario</h3>
                            <button 
                                onClick={() => setUsuarioAEditar(null)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleGuardarEdicion} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                                <input 
                                    type="text" 
                                    value={usuarioAEditar.nombre || 'Sin nombre'}
                                    disabled
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                                <p className="text-xs text-gray-400 mt-1">El nombre no se puede modificar.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Rol en el Sistema</label>
                                <select 
                                    value={usuarioAEditar.rol}
                                    onChange={(e) => setUsuarioAEditar({...usuarioAEditar, rol: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                                >
                                    <option value="operario">Operador / Obrera</option>
                                    <option value="contador">Contador</option>
                                    <option value="tecnico">Técnico</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Asignar Saldo Disponible</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <DollarSign className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input 
                                        type="number" 
                                        min="0"
                                        step="1"
                                        value={usuarioAEditar.saldo_disponible}
                                        onChange={(e) => setUsuarioAEditar({...usuarioAEditar, saldo_disponible: e.target.value})}
                                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button 
                                    type="button"
                                    onClick={() => setUsuarioAEditar(null)}
                                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit"
                                    disabled={guardando}
                                    className="flex-1 px-4 py-2 text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                                >
                                    {guardando ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}