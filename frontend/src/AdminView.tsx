import { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, Receipt, Users, TrendingDown, Calendar as CalendarIcon, Search, X, Filter, Download, FileDown, ArrowLeftRight } from 'lucide-react';
import { Button } from './button';
import { AdminCalendar } from './admin-calendar';
import { ExpenseDetailModal } from './expense-detail-modal';
import { WorkerManagement } from './worker-management';
import { Input } from './input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './select';
import { Badge } from './badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from './table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from './dropdown-menu';
import { downloadMultipleExpensesPDF } from './pdf-generator';
import { supabase } from './lib/supabase';

interface Worker {
    id: string;
    name: string;
    balance: number;
}

interface Expense {
    id: string;
    workerId?: string;
    workerName?: string;
    concept: string;
    amount: number;
    photo: string;
    date: Date;

}
interface AdminViewProps {
    onSwitchView?: () => void;
}

export default function AdminView({ onSwitchView }: AdminViewProps) {
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [activeView, setActiveView] = useState<'dashboard' | 'calendar' | 'workers'>('dashboard');

    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('all');
    const [amountFilter, setAmountFilter] = useState('all');
    const [workerFilter, setWorkerFilter] = useState('all');

    useEffect(() => {
        async function fetchAdminData() {
            try {
                const { data: perfilesData, error: perfilesError } = await supabase
                    .from('perfiles')
                    .select('*')
                    .neq('rol', 'admin');

                if (perfilesError) throw perfilesError;

                if (perfilesData) {
                    const formatWorkers = perfilesData.map(p => ({
                        id: p.id,
                        name: `${p.nombre || ''} ${p.apellido || ''}`.trim() || 'Sin Nombre',
                        balance: p.saldo_disponible || 0
                    }));
                    setWorkers(formatWorkers);
                }

                const { data: gastosData, error: gastosError } = await supabase
                    .from('gastos')
                    .select('*, perfiles(nombre, apellido)');

                if (gastosError) throw gastosError;

                if (gastosData) {
                    const formatExpenses = gastosData.map(g => ({
                        id: g.id,
                        workerId: g.operario_id,
                        workerName: g.perfiles ? `${g.perfiles.nombre || ''} ${g.perfiles.apellido || ''}`.trim() : 'Desconocido',
                        concept: g.concepto,
                        amount: g.monto,
                        photo: g.foto_url,
                        date: new Date(g.fecha_creacion)
                    }));
                    setExpenses(formatExpenses);
                }
            } catch (error) {
                console.error("Error cargando datos:", error);
            }
        }

        fetchAdminData();
    }, []);

    const handleAddWorker = (name: string) => {
        const newWorker: Worker = {
            id: Date.now().toString(),
            name,
            balance: 0,
        };
        setWorkers([...workers, newWorker]);
    };

    const handleAddBalance = async (workerId: string, amount: number) => {
        try {
            const workerToUpdate = workers.find(w => w.id === workerId);
            if (!workerToUpdate) return;

            const nuevoSaldo = workerToUpdate.balance + amount;

            const { error } = await supabase
                .from('perfiles')
                .update({ saldo_disponible: nuevoSaldo })
                .eq('id', workerId);

            if (error) throw error;

            setWorkers(workers.map((worker) =>
                worker.id === workerId ? { ...worker, balance: nuevoSaldo } : worker
            ));
        } catch (error) {
            console.error("Error al actualizar saldo:", error);
            alert("Hubo un error al intentar recargar el saldo.");
        }
    };

    const filteredExpenses = useMemo(() => {
        let filtered = [...expenses];

        if (searchTerm) {
            filtered = filtered.filter((exp) =>
                exp.concept.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (workerFilter !== 'all') {
            filtered = filtered.filter((exp) => exp.workerId === workerFilter);
        }

        if (dateFilter !== 'all') {
            const now = new Date();
            filtered = filtered.filter((exp) => {
                const expDate = new Date(exp.date);
                const diffTime = now.getTime() - expDate.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                switch (dateFilter) {
                    case 'today': return diffDays === 1;
                    case 'week': return diffDays <= 7;
                    case 'month': return diffDays <= 30;
                    case '3months': return diffDays <= 90;
                    default: return true;
                }
            });
        }

        if (amountFilter !== 'all') {
            filtered = filtered.filter((exp) => {
                switch (amountFilter) {
                    case '0-5000': return exp.amount >= 0 && exp.amount < 5000;
                    case '5000-10000': return exp.amount >= 5000 && exp.amount < 10000;
                    case '10000-20000': return exp.amount >= 10000 && exp.amount < 20000;
                    case '20000-50000': return exp.amount >= 20000 && exp.amount < 50000;
                    case '50000+': return exp.amount >= 50000;
                    default: return true;
                }
            });
        }

        return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [expenses, searchTerm, dateFilter, amountFilter, workerFilter]);

    const activeFiltersCount = [
        searchTerm ? 1 : 0,
        dateFilter !== 'all' ? 1 : 0,
        amountFilter !== 'all' ? 1 : 0,
        workerFilter !== 'all' ? 1 : 0,
    ].reduce((sum, val) => sum + val, 0);

    const handleClearFilters = () => {
        setSearchTerm('');
        setDateFilter('all');
        setAmountFilter('all');
        setWorkerFilter('all');
    };

    const handleExpenseClick = (expense: Expense) => {
        setSelectedExpense(expense);
        setModalOpen(true);
    };

    const totalAmount = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    // const totalBalance = workers.reduce((sum, worker) => sum + worker.balance, 0);

    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('es-CL', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    };

    return (
        <div className="flex h-screen bg-slate-300">
            <aside className="w-64 bg-gradient-to-b from-cyan-700 to-cyan-600 text-white flex flex-col">
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-1">
                        <img
                            src="/c-mvt_logo.png"
                            alt="Logo CMVT"
                            className="h-12 w-auto drop-shadow-md"
                        />
                        <h1 className="text-2xl font-semibold tracking-tight">Control Gastos</h1>
                    </div>


                    <p className="text-cyan-100 text-sm ml-11">Panel Administrativo</p>
                </div>

                <nav className="flex-1 px-3 space-y-1">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeView === 'dashboard'
                            ? 'bg-white/20 backdrop-blur-sm'
                            : 'hover:bg-white/10'
                            }`}
                    >
                        <LayoutDashboard className="h-5 w-5" />
                        <span>Dashboard</span>
                    </button>
                    <button
                        onClick={() => setActiveView('calendar')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeView === 'calendar'
                            ? 'bg-white/20 backdrop-blur-sm'
                            : 'hover:bg-white/10'
                            }`}
                    >
                        <CalendarIcon className="h-5 w-5" />
                        <span>Calendario</span>
                    </button>
                    <button
                        onClick={() => setActiveView('workers')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeView === 'workers'
                            ? 'bg-white/20 backdrop-blur-sm'
                            : 'hover:bg-white/10'
                            }`}
                    >
                        <Users className="h-5 w-5" />
                        <span>Trabajadores</span>
                    </button>
                </nav>

                <div className="p-4 border-t border-cyan-500">
                    {onSwitchView && (
                        <button
                            onClick={onSwitchView}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-800/50 hover:bg-cyan-900/50 text-cyan-100 rounded-lg transition-colors text-sm border border-cyan-700"
                        >
                            <ArrowLeftRight className="h-4 w-4" />
                            Cambiar a Trabajador
                        </button>
                    )}
                </div>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white border-b border-gray-200 px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl text-gray-900">
                                {activeView === 'dashboard' && 'Gestión de Boletas'}
                                {activeView === 'calendar' && 'Calendario de Gastos'}
                                {activeView === 'workers' && 'Gestión de Trabajadores'}
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                {activeView === 'workers'
                                    ? `${workers.length} trabajadores registrados`
                                    : `${filteredExpenses.length} boletas registradas`}
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            {activeView !== 'workers' && filteredExpenses.length > 0 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="gap-2 text-cyan-700 border-cyan-200 hover:bg-cyan-50">
                                            <Download className="h-4 w-4" />
                                            Descargar PDF
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-64 bg-white rounded-md shadow-xl border border-gray-200 p-1 z-50">

                                        <DropdownMenuItem
                                            className="flex items-center cursor-pointer hover:bg-gray-100 p-2 rounded text-sm text-gray-700"
                                            onClick={() => downloadMultipleExpensesPDF(filteredExpenses, 'Reporte de Boletas')}
                                        >
                                            <FileDown className="h-4 w-4 mr-3 text-cyan-600" />
                                            Descargar filtradas ({filteredExpenses.length})
                                        </DropdownMenuItem>

                                        <DropdownMenuSeparator className="bg-gray-200 my-1" />

                                        <DropdownMenuItem
                                            className="flex items-center cursor-pointer hover:bg-gray-100 p-2 rounded text-sm text-gray-700"
                                            onClick={() => downloadMultipleExpensesPDF(expenses, 'Reporte total de Egresos')}
                                        >
                                            <Receipt className="h-4 w-4 mr-3 text-cyan-600" />
                                            Descargar todo el historial ({expenses.length})
                                        </DropdownMenuItem>

                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-sm text-gray-500">Total Gastado</p>
                                <p className="text-2xl text-cyan-600">${totalAmount.toLocaleString('es-CL')}</p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-8">
                    {activeView === 'workers' ? (
                        <WorkerManagement
                            workers={workers}
                            onAddWorker={handleAddWorker}
                            onAddBalance={handleAddBalance}
                        />
                    ) : activeView === 'dashboard' ? (
                        <div className="space-y-6">
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500 font-bold">Total Boletas</p>
                                            <p className="text-3xl mt-2 text-gray-900">{filteredExpenses.length}</p>
                                        </div>
                                        <div className="bg-cyan-100 rounded-full p-3">
                                            <Receipt className="h-6 w-6 text-cyan-600" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500 font-bold">Monto Total</p>
                                            <p className="text-3xl mt-2 text-cyan-600">
                                                ${(totalAmount / 1000).toFixed(0)}k
                                            </p>
                                        </div>
                                        <div className="bg-green-100 rounded-full p-3">
                                            <TrendingDown className="h-6 w-6 text-green-600" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500 font-bold">Promedio por Gasto</p>
                                            <p className="text-3xl mt-2 text-gray-900">
                                                ${filteredExpenses.length > 0 ? Math.round(totalAmount / filteredExpenses.length).toLocaleString('es-CL') : 0}
                                            </p>
                                        </div>
                                        <div className="bg-blue-100 rounded-full p-3">
                                            <Receipt className="h-6 w-6 text-blue-600" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-500 font-bold">Trabajadores</p>
                                            <p className="text-3xl mt-2 text-gray-900">{workers.length}</p>
                                        </div>
                                        <div className="bg-purple-100 rounded-full p-3">
                                            <Users className="h-6 w-6 text-purple-600" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 flex-1">
                                        <Filter className="h-5 w-5 text-gray-400" />
                                        <span className="text-sm text-gray-600">Filtros:</span>
                                        {activeFiltersCount > 0 && (
                                            <Badge className="bg-cyan-100 text-cyan-700">
                                                {activeFiltersCount} activos
                                            </Badge>
                                        )}
                                    </div>
                                    {activeFiltersCount > 0 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleClearFilters}
                                            className="text-gray-600"
                                        >
                                            Limpiar filtros
                                        </Button>
                                    )}
                                </div>

                                <div className="grid grid-cols-4 gap-4 mt-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            type="text"
                                            placeholder="Buscar por concepto..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-10 pr-10"
                                        />
                                        {searchTerm && (
                                            <button
                                                onClick={() => setSearchTerm('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2"
                                            >
                                                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                                            </button>
                                        )}
                                    </div>

                                    <Select value={workerFilter} onValueChange={setWorkerFilter}>
                                        <SelectTrigger className='bg-white'>
                                            <SelectValue placeholder="Trabajador" />
                                        </SelectTrigger>
                                        <SelectContent className='bg-white border border-gray-200 shadow-md'>
                                            <SelectItem value="all">Todos los trabajadores</SelectItem>
                                            {workers.map((worker) => (
                                                <SelectItem key={worker.id} value={worker.id}>
                                                    {worker.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Select value={dateFilter} onValueChange={setDateFilter}>
                                        <SelectTrigger className='bg-white'>
                                            <SelectValue placeholder="Período" />
                                        </SelectTrigger>
                                        <SelectContent className='bg-white border border-gray-200 shadow-md'>
                                            <SelectItem value="all">Todos los períodos</SelectItem>
                                            <SelectItem value="today">Hoy</SelectItem>
                                            <SelectItem value="week">Última semana</SelectItem>
                                            <SelectItem value="month">Último mes</SelectItem>
                                            <SelectItem value="3months">Últimos 3 meses</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select value={amountFilter} onValueChange={setAmountFilter}>
                                        <SelectTrigger className='bg-white'>
                                            <SelectValue placeholder="Rango de monto" />
                                        </SelectTrigger>
                                        <SelectContent className='bg-white border border-gray-200 shadow-md'>
                                            <SelectItem value="all">Todos los montos</SelectItem>
                                            <SelectItem value="0-5000">$0 - $5.000</SelectItem>
                                            <SelectItem value="5000-10000">$5.000 - $10.000</SelectItem>
                                            <SelectItem value="10000-20000">$10.000 - $20.000</SelectItem>
                                            <SelectItem value="20000-50000">$20.000 - $50.000</SelectItem>
                                            <SelectItem value="50000+">$50.000+</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-50">
                                            <TableHead className="w-[80px] text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Foto</TableHead>
                                            <TableHead className="w-[20%] text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Trabajador</TableHead>
                                            <TableHead className="w-[30%] text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Concepto</TableHead>
                                            <TableHead className="w-[15%] text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</TableHead>
                                            <TableHead className="w-[20%] text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha y Hora</TableHead>
                                            <TableHead className="w-[100px] text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Acción</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredExpenses.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-12">
                                                    <div className="flex flex-col items-center text-gray-400">
                                                        <Receipt className="h-16 w-16 mb-4" />
                                                        <p>No hay boletas que coincidan con los filtros</p>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredExpenses.map((expense) => (
                                                <TableRow
                                                    key={expense.id}
                                                    className="cursor-pointer hover:bg-cyan-50"
                                                    onClick={() => handleExpenseClick(expense)}
                                                >
                                                    <TableCell>
                                                        <img
                                                            src={expense.photo}
                                                            alt="Boleta"
                                                            className="w-14 h-14 object-cover rounded"
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <div className="bg-cyan-100 rounded-full p-1.5">
                                                                <Users className="h-3 w-3 text-cyan-600" />
                                                            </div>
                                                            <span className="font-medium">{expense.workerName}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{expense.concept}</TableCell>
                                                    <TableCell>
                                                        <span className="text-cyan-600">
                                                            ${expense.amount.toLocaleString('es-CL')}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-gray-600">
                                                        {formatDate(expense.date)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleExpenseClick(expense);
                                                            }}
                                                        >
                                                            Ver
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <AdminCalendar
                                expenses={filteredExpenses}
                                onExpenseClick={handleExpenseClick}
                            />
                        </div>
                    )}
                </div>
            </main>

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