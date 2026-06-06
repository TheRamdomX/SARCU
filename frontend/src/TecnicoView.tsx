import React, { useState, useEffect } from 'react';
import { Users, ShieldAlert, UserPlus, Database } from 'lucide-react';
import CrearUsuario from './CrearUsuario'; // Mantenemos tu componente

export default function TecnicoView() {
    const [usuario, setUsuario] = useState({
        nombre: "Técnico de Soporte", 
        rol: "tecnico"
    });

    useEffect(() => {
        // Aquí puedes leer el nombre real si lo guardas en el login
        // const nombreGuardado = localStorage.getItem('scg_nombre') || 'Técnico de Soporte';
        // setUsuario(prev => ({ ...prev, nombre: nombreGuardado }));
    }, []);

    const handleCerrarSesion = () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/'; 
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ENCABEZADO CMVT ESTILO OPERARIO/ADMIN */}
            <div className="bg-gradient-to-b from-cyan-50 to-white">
                <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 text-white p-6 pb-8 rounded-b-3xl shadow-lg">
                    <div className="flex justify-between items-start mb-6">
                        
                        {/* Izquierda: Logo y Textos */}
                        <div className="flex items-center gap-4">
                            <img
                                src="/c-mvt_logo.png"
                                alt="Logo CMVT"
                                className="h-12 w-auto drop-shadow-md"
                            />
                            <div>
                                <p className="text-sm font-light tracking-wide text-cyan-100 text-left">Panel de Administración</p>
                                <h1 className="text-2xl font-semibold mt-0.5 text-left leading-tight flex items-center gap-2">
                                    <ShieldAlert className="h-6 w-6" />
                                    {usuario.nombre}
                                </h1>
                            </div>
                        </div>

                        {/* Derecha: Botón Cerrar Sesión (Estilo unificado) */}
                        <div className="flex flex-col items-end gap-2">
                            <button 
                                onClick={handleCerrarSesion}
                                className="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2 px-4 rounded-full transition-colors shadow-md"
                            >
                                Cerrar Sesión
                            </button>
                        </div>
                    </div>

                    {/* Tarjeta de Resumen Técnico */}
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
                        <div className="flex items-center gap-2 mb-3">
                            <Database className="h-5 w-5" />
                            <span className="text-sm text-cyan-100">Módulo de Accesos y Credenciales</span>
                        </div>
                        <p className="text-xl mb-1 text-left font-medium">Gestión de Usuarios del Sistema</p>
                    </div>
                </div>
            </div>

            {/* CONTENIDO PRINCIPAL */}
            <div className="p-6 max-w-5xl mx-auto space-y-6 mt-2">
                
                {/* Contenedor estilizado para tu formulario de Crear Usuario */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
                        <UserPlus className="h-5 w-5 text-cyan-600" />
                        <h2 className="text-lg font-semibold text-gray-800">Registrar Nuevo Personal</h2>
                    </div>
                    {/* Aquí se inyecta tu componente tal cual lo creaste */}
                    <CrearUsuario />
                </div>

                {/* Directorio de Usuarios (Estructura de Tabla para más adelante) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                        <Users className="h-5 w-5 text-gray-600" />
                        <h3 className="font-semibold text-gray-700">Directorio de Usuarios Activos</h3>
                    </div>
                    
                    <div className="p-12 text-center text-gray-500 flex flex-col items-center bg-white">
                        <Users className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="font-medium text-gray-600">La tabla de usuarios se cargará aquí...</p>
                        <p className="text-sm text-gray-400 mt-1">Pendiente: Conectar con el microservicio de perfiles</p>
                    </div>
                </div>

            </div>
        </div>
    );
}