import { useState } from 'react';
import { UserPlus, Wallet, Plus, Users, DollarSign } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './Label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from './dialog';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from './card';

interface Worker {
    id: string;
    name: string;
    balance: number;
}

interface WorkerManagementProps {
    workers: Worker[];
    onAddWorker: (name: string) => void;
    onAddBalance: (workerId: string, amount: number) => void;
}

export function WorkerManagement({ workers, onAddWorker, onAddBalance }: WorkerManagementProps) {
    const [newWorkerDialogOpen, setNewWorkerDialogOpen] = useState(false);
    const [newWorkerName, setNewWorkerName] = useState('');
    const [addBalanceDialogOpen, setAddBalanceDialogOpen] = useState(false);
    const [selectedWorkerId, setSelectedWorkerId] = useState('');
    const [balanceAmount, setBalanceAmount] = useState('');

    const handleAddWorker = () => {
        if (newWorkerName.trim()) {
            onAddWorker(newWorkerName.trim());
            setNewWorkerName('');
            setNewWorkerDialogOpen(false);
        }
    };

    const handleAddBalance = () => {
        const amount = parseInt(balanceAmount);
        if (selectedWorkerId && amount > 0) {
            onAddBalance(selectedWorkerId, amount);
            setBalanceAmount('');
            setAddBalanceDialogOpen(false);
            setSelectedWorkerId('');
        }
    };

    const openAddBalanceDialog = (workerId: string) => {
        setSelectedWorkerId(workerId);
        setAddBalanceDialogOpen(true);
    };

    const selectedWorker = workers.find((w) => w.id === selectedWorkerId);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-semibold text-gray-900">Gestión de Trabajadores</h3>
                    <p className="text-sm text-gray-500 mt-1">
                        Administra los trabajadores y sus saldos disponibles
                    </p>
                </div>
                <Dialog open={newWorkerDialogOpen} onOpenChange={setNewWorkerDialogOpen}>
                    <DialogTrigger asChild>
                        {/* <Button className="bg-cyan-600 hover:bg-cyan-700">
                            <UserPlus className="h-4 w-4 mr-2" />
                            Nuevo Trabajador
                        </Button> */}
                    </DialogTrigger>
                    <DialogContent>
                        {/* <DialogHeader>
                            <DialogTitle>Agregar Nuevo Trabajador</DialogTitle>
                            <DialogDescription>
                                Ingresa el nombre del trabajador para agregarlo al sistema
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="workerName">Nombre del Trabajador</Label>
                                <Input
                                    id="workerName"
                                    placeholder="Ej: Juan Pérez"
                                    value={newWorkerName}
                                    onChange={(e) => setNewWorkerName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAddWorker();
                                        }
                                    }}
                                />
                            </div>
                            <Button onClick={handleAddWorker} className="w-full" disabled={!newWorkerName.trim()}>
                                Agregar Trabajador
                            </Button>
                        </div> */}
                    </DialogContent>
                </Dialog>
            </div>

            {/* Workers Grid */}
            {workers.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Users className="h-16 w-16 text-gray-300 mb-4" />
                        <p className="text-gray-500">No hay trabajadores registrados</p>
                        <p className="text-sm text-gray-400 mt-1">
                            Haz clic en "Nuevo Trabajador" para comenzar
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {workers.map((worker) => (
                        <Card key={worker.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <div className="bg-cyan-100 rounded-full p-2">
                                        <Users className="h-4 w-4 text-cyan-600" />
                                    </div>
                                    {worker.name}
                                </CardTitle>
                                <CardDescription>Saldo disponible</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Wallet className="h-4 w-4 text-cyan-600" />
                                        <span className="text-sm text-cyan-700">Saldo Actual</span>
                                    </div>
                                    <p className="text-3xl text-cyan-700">
                                        ${worker.balance.toLocaleString('es-CL')}
                                    </p>
                                </div>
                                <Button
                                    onClick={() => openAddBalanceDialog(worker.id)}
                                    variant="outline"
                                    className="w-full border-cyan-600 text-cyan-600 hover:bg-cyan-50"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Agregar Saldo
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add Balance Dialog */}
            <Dialog open={addBalanceDialogOpen} onOpenChange={setAddBalanceDialogOpen}>
                <DialogContent className="max-w-md bg-white rounded-xl shadow-xl border-none">
                    <DialogHeader>
                        <DialogTitle>Agregar Saldo</DialogTitle>
                        <DialogDescription>
                            Aumenta el saldo disponible para {selectedWorker?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4 ">
                        <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-200">
                            <p className="text-sm text-cyan-700 mb-1">Saldo Actual</p>
                            <p className="text-2xl text-cyan-800">
                                ${selectedWorker?.balance.toLocaleString('es-CL')}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="balanceAmount">Monto a Agregar</Label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    id="balanceAmount"
                                    type="number"
                                    placeholder="Ej: 50000"
                                    value={balanceAmount}
                                    onChange={(e) => setBalanceAmount(e.target.value)}
                                    className="pl-10"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAddBalance();
                                        }
                                    }}
                                />
                            </div>
                        </div>
                        {balanceAmount && parseInt(balanceAmount) > 0 && (
                            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                                <p className="text-sm text-green-700 mb-1">Nuevo Saldo</p>
                                <p className="text-2xl text-green-800">
                                    ${((selectedWorker?.balance || 0) + parseInt(balanceAmount)).toLocaleString('es-CL')}
                                </p>
                            </div>
                        )}
                        <Button
                            onClick={handleAddBalance}
                            className="w-full bg-cyan-600 hover:bg-cyan-700"
                            disabled={!balanceAmount || parseInt(balanceAmount) <= 0}
                        >
                            Confirmar Agregado
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
