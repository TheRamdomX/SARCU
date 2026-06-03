import { useState, useEffect } from 'react';
import { Plus, Wallet, TrendingDown, History, ArrowLeft } from 'lucide-react';
import { ExpenseHistory } from "./Expense_history";
import { ExpenseForm } from './expense-form';
import { ExpenseDetailModal } from './expense-detail-modal';
import { supabase } from './lib/supabase';
import { Button } from './button';


export interface Expense {
    id: string;
    concept: string;
    amount: number;
    photo: string;
    date: Date;
}
interface OperarioProps {
    onReturnToAdmin?: () => void;
}
export default function Operario({ onReturnToAdmin }: OperarioProps) {
    const [usuario, setUsuario] = useState({
        id: "",
        nombre: "Cargando...",
        apellido: "",
        rol: "",
        saldo_disponible: 0
    });
    const [view, setView] = useState<'home' | 'form'>('home');
    const [cargando, setCargando] = useState(true);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
        async function obtenerDatos() {
            try {

                const { data: { user } } = await supabase.auth.getUser();

                if (user) {

                    const { data: perfilData, error: perfilError } = await supabase
                        .from('perfiles')
                        .select('nombre, apellido, rol, saldo_disponible')
                        .eq('id', user.id)
                        .single();

                    if (perfilError) throw perfilError;

                    if (perfilData) {
                        setUsuario({
                            id: user.id,
                            nombre: perfilData.nombre || "Operario",
                            apellido: perfilData.apellido || "",
                            rol: perfilData.rol || "operario",
                            saldo_disponible: perfilData.saldo_disponible || 0
                        });
                    }


                    const { data: gastosData, error: gastosError } = await supabase
                        .from('gastos')
                        .select('*')
                        .eq('operario_id', user.id)
                        .order('fecha_creacion', { ascending: false }); // Los más nuevos primero

                    if (gastosError) throw gastosError;

                    if (gastosData) {

                        const historialFormateado = gastosData.map(g => ({
                            id: g.id,
                            concept: g.concepto,
                            amount: g.monto,
                            photo: g.foto_url,
                            date: new Date(g.fecha_creacion)
                        }));
                        setExpenses(historialFormateado);
                    }
                }
            } catch (err) {
                console.error("Error al cargar los datos:", err);
            } finally {
                setCargando(false);
            }
        }

        obtenerDatos();
    }, []);

    const handleAddExpense = async (nuevoGasto: { concept: string; amount: number; photo: string; date: Date }) => {
        try {
            const nuevoSaldo = usuario.saldo_disponible - nuevoGasto.amount;
            const { data, error } = await supabase
                .from('gastos')
                .insert([
                    {
                        operario_id: usuario.id,
                        monto: nuevoGasto.amount,
                        concepto: nuevoGasto.concept,
                        foto_url: nuevoGasto.photo,
                    }
                ])
                .select()
                .single();
            if (error) throw error;
            const { error: updateError } = await supabase
                .from('perfiles')
                .update({ saldo_disponible: nuevoSaldo })
                .eq('id', usuario.id);
            if (updateError) throw updateError;

            const gastoConfirmado: Expense = {
                id: data.id,
                concept: data.concepto,
                amount: data.monto,
                photo: data.foto_url,
                date: new Date(data.fecha_creacion)
            };

            setUsuario(prevUsuario => ({ ...prevUsuario, saldo_disponible: nuevoSaldo }));


            setExpenses([gastoConfirmado, ...expenses]);
            setView('home');
        } catch (error) {
            console.error("Error procesando la transacción:", error);
            alert("Hubo un error al registrar el gasto y actualizar el saldo. Revisa la conexión.");
        }
    };

    const handleExpenseClick = (expense: Expense) => {
        setSelectedExpense(expense);
        setModalOpen(true);
    };

    if (cargando) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-cyan-600 font-medium">Cargando tu información...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {view === 'form' ? (
                <ExpenseForm
                    workerName={usuario.nombre}
                    availableBalance={usuario.saldo_disponible}
                    onSubmit={handleAddExpense}
                    onCancel={() => setView('home')}
                />
            ) : (
                <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-white">
                    <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 text-white p-6 pb-8 rounded-b-3xl shadow-lg">
                        {/* 1. BOTÓN DE VOLVER (Solo visible para el Admin) */}
                        {onReturnToAdmin && (
                            <div className="flex justify-start mb-4">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onReturnToAdmin}
                                    className="text-cyan-50 hover:text-white hover:bg-cyan-700/50 bg-cyan-900/20 rounded-full px-4 transition-colors"
                                >
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Volver al Panel Admin
                                </Button>
                            </div>
                        )}
                        {/* 2. LOGO Y NOMBRE ALINEADOS */}
                        <div className="mb-6 flex items-center gap-4">
                            <img
                                src="/c-mvt_logo.png"
                                alt="Logo CMVT"
                                className="h-12 w-auto drop-shadow-md"
                            />
                            <div>
                                <p className="text-sm font-light tracking-wide text-cyan-100 text-left">Bienvenido</p>
                                <h1 className="text-2xl font-semibold mt-0.5 text-left leading-tight">
                                    {usuario.nombre} {usuario.apellido}
                                </h1>
                            </div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
                            <div className="flex items-center gap-2 mb-3">
                                <Wallet className="h-5 w-5" />
                                <span className="text-sm text-cyan-100">Saldo Disponible</span>
                            </div>
                            <p className="text-4xl mb-4 text-left">${usuario.saldo_disponible.toLocaleString('es-CL')}</p>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-cyan-100">Presupuesto inicial:</span>
                                <span>${(100000).toLocaleString('es-CL')}</span>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 pb-24">
                        {expenses.length > 0 && (
                            <div className="bg-gradient-to-r from-cyan-50 to-teal-50 rounded-xl p-4 mb-6 border border-cyan-200">
                                <div className="flex items-center gap-2 text-cyan-800">
                                    <TrendingDown className="h-5 w-5" />
                                    <div>
                                        <p className="text-sm">Gastos reportados</p>
                                        <p className="text-xl font-semibold">
                                            {expenses.length} {expenses.length === 1 ? 'boleta' : 'boletas'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between mb-4 mt-2">
                            <div className="flex items-center gap-2">
                                <History className="h-5 w-5 text-gray-600" />
                                <h2 className="text-lg text-gray-700 font-semibold">Historial de Gastos</h2>
                            </div>
                        </div>
                        <ExpenseHistory
                            expenses={expenses}
                            onExpenseClick={handleExpenseClick}
                        />
                    </div>
                    <div className="fixed bottom-6 right-6">
                        <Button
                            size="lg"
                            className="h-14 w-14 rounded-full shadow-lg bg-cyan-600 hover:bg-cyan-700"
                            onClick={() => setView('form')}
                        >
                            <Plus className="h-6 w-6 text-white" />
                        </Button>
                    </div>
                </div>
            )}
            <ExpenseDetailModal
                expense={selectedExpense}
                open={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setSelectedExpense(null);
                }}
            />
        </div>
    );
}