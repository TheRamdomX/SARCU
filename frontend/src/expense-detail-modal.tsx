import { X, Calendar, Receipt, Download } from 'lucide-react';
import { Button } from './button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from './dialog';
import { downloadSingleExpensePDF } from './pdf-generator';
interface Expense {
    id: string;
    workerId?: string;
    workerName?: string;
    concept: string;
    amount: number;
    photo: string;
    date: Date;
}

interface ExpenseDetailModalProps {
    expense: Expense | null;
    open: boolean;
    onClose: () => void;
}

export function ExpenseDetailModal({ expense, open, onClose }: ExpenseDetailModalProps) {
    if (!expense) return null;

    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('es-CL', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    };
    const handleDownloadPDF = async () => {

        const expenseWithDefaults = {
            ...expense,
            workerId: expense.workerId || '1',
            workerName: expense.workerName || 'Trabajador',
        };
        await downloadSingleExpensePDF(expenseWithDefaults);
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md bg-white rounded-xl shadow-xl border-none">
                <DialogHeader>
                    <DialogTitle>Detalles del Gasto</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    {/* Photo */}
                    <div>
                        <img
                            src={expense.photo}
                            alt="Boleta"
                            className="w-full h-64 object-cover rounded-lg"
                        />
                    </div>

                    {/* Details */}
                    <div className="space-y-3">
                        <div>
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                                <Receipt className="h-4 w-4" />
                                <span>Descripción</span>
                            </div>
                            <p className="text-gray-900">{expense.concept}</p>
                        </div>

                        <div>
                            <div className="text-sm text-gray-600 mb-1">Monto</div>
                            <p className="text-2xl text-green-600">
                                ${expense.amount.toLocaleString('es-CL')}
                            </p>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                                <Calendar className="h-4 w-4" />
                                <span>Fecha</span>
                            </div>
                            <p className="text-gray-900 capitalize">{formatDate(expense.date)}</p>
                        </div>
                    </div>
                    <div className="flex gap-2 ">
                        <Button onClick={handleDownloadPDF} variant="outline" className="flex-1  mt-4 bg-cyan-800 hover:bg-cyan-300 text-white">
                            <Download className="h-4 w-4 mr-2" />
                            Descargar PDF
                        </Button>

                    </div>
                    <Button onClick={onClose} className="w-full mt-4 bg-cyan-800 hover:bg-cyan-300 text-white">
                        <X className="h-4 w-4 mr-2" />
                        Cerrar
                    </Button>

                </div>
            </DialogContent>
        </Dialog>
    );
}