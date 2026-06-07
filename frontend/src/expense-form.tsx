import { useState } from 'react';
import { Camera, Upload, X, Check, Loader2 } from 'lucide-react';
import { Button } from './button';
import { Textarea } from './TextArea';
import { Input } from './Inputs';
import { Label } from './Label';
import imageCompression from 'browser-image-compression';
import { supabase } from './lib/supabase';

interface ExpenseFormProps {
    workerName: string;
    availableBalance: number;
    onSubmit: (expense: { concept: string; amount: number; photo: string; date: Date; }) => void;
    onCancel: () => void;
}

export function ExpenseForm({ workerName, availableBalance, onSubmit, onCancel }: ExpenseFormProps) {
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [concept, setConcept] = useState('');
    const [amount, setAmount] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setPhotoPreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleRemovePhoto = () => {
        setPhotoPreview(null);
        setPhotoFile(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const numAmount = parseFloat(amount);

        if (!photoFile) return setError('Debes capturar o subir una foto de la boleta.');
        if (!concept.trim()) return setError('Debes ingresar el concepto del gasto.');
        if (!amount || isNaN(numAmount) || numAmount <= 0) return setError('Debes ingresar un monto válido.');
        if (numAmount > availableBalance) return setError(`El monto excede tu saldo disponible ($${availableBalance.toLocaleString('es-CL')}).`);

        setIsSubmitting(true);

        try {
            const fotoComprimida = await imageCompression(photoFile, {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 1024,
                useWebWorker: true,
            });

            const nombreArchivo = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

            const { error: errorStorage } = await supabase.storage
                .from('comprobantes')
                .upload(nombreArchivo, fotoComprimida);

            if (errorStorage) throw errorStorage;

            const { data: urlData } = supabase.storage
                .from('comprobantes')
                .getPublicUrl(nombreArchivo);

            onSubmit({
                concept: concept.trim(),
                amount: numAmount,
                photo: urlData.publicUrl,
                date: new Date(),
            });
        } catch (err) {
            console.error("Error al procesar el gasto:", err);
            setError("Hubo un error al subir la foto. Revisa tu conexión a internet.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center py-0 md:py-8">
            {/* Contenedor centralizado estilo App Móvil */}
            <div className="w-full max-w-md bg-white min-h-screen md:min-h-[850px] shadow-2xl border-x md:border md:rounded-[2.5rem] border-gray-200 flex flex-col relative overflow-hidden">
                <div className="p-6 flex-1 pb-32 overflow-y-auto">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">Reportar Gasto</h1>
                        <Button variant="ghost" size="icon" onClick={onCancel} className="hover:bg-gray-100 rounded-full">
                            <X className="h-6 w-6 text-gray-500" />
                        </Button>
                    </div>

                    {/* Tarjeta de Saldo */}
                    <div className="bg-cyan-50 rounded-2xl p-5 mb-8 border border-cyan-100 shadow-inner">
                        <p className="text-sm text-cyan-800 font-medium mb-1">Trabajador: <span className="font-bold">{workerName}</span></p>
                        <p className="text-sm text-cyan-800 mt-3">Saldo disponible</p>
                        <p className="text-3xl font-extrabold text-cyan-600">${availableBalance.toLocaleString('es-CL')}</p>
                    </div>

                    <form id="expense-form" onSubmit={handleSubmit} className="space-y-6">
                        {/* Captura de Foto */}
                        <div>
                            <Label className="text-sm font-bold text-gray-700 mb-3 block">Evidencia de la Boleta *</Label>
                            {!photoPreview ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <Label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-cyan-200 rounded-2xl cursor-pointer bg-white hover:bg-cyan-50 hover:border-cyan-400 transition-all group shadow-sm">
                                        <Camera className="h-8 w-8 text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
                                        <span className="text-sm font-medium text-gray-600">Cámara</span>
                                        <Input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                                    </Label>
                                    <Label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-cyan-200 rounded-2xl cursor-pointer bg-white hover:bg-cyan-50 hover:border-cyan-400 transition-all group shadow-sm">
                                        <Upload className="h-8 w-8 text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
                                        <span className="text-sm font-medium text-gray-600">Galería</span>
                                        <Input type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" />
                                    </Label>
                                </div>
                            ) : (
                                <div className="relative rounded-2xl overflow-hidden shadow-md border border-gray-200">
                                    <img src={photoPreview} alt="Boleta" className="w-full h-56 object-cover" />
                                    <Button type="button" variant="destructive" size="icon" className="absolute top-3 right-3 rounded-full shadow-lg" onClick={handleRemovePhoto}>
                                        <X className="h-5 w-5" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Descripción */}
                        <div>
                            <Label htmlFor="concept" className="text-sm font-bold text-gray-700 mb-2 block">Descripción del Gasto</Label>
                            <Textarea 
                                id="concept" 
                                placeholder="Ej: Materiales, transporte, alimentación..." 
                                value={concept} 
                                onChange={(e) => setConcept(e.target.value)} 
                                className="min-h-[100px] resize-none rounded-xl bg-gray-50 border-gray-200 focus:bg-white" 
                            />
                        </div>

                        {/* Monto */}
                        <div>
                            <Label htmlFor="amount" className="text-sm font-bold text-gray-700 mb-2 block">Monto Solicitado</Label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                <Input 
                                    id="amount" 
                                    type="number" 
                                    placeholder="0" 
                                    value={amount} 
                                    onChange={(e) => setAmount(e.target.value)} 
                                    className="pl-8 text-lg font-bold rounded-xl h-14 bg-gray-50 border-gray-200 focus:bg-white" 
                                    inputMode="decimal" 
                                />
                            </div>
                        </div>

                        {/* Alerta de Error */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 animate-in slide-in-from-top-2">
                                <X className="h-5 w-5 shrink-0" />
                                {error}
                            </div>
                        )}
                    </form>
                </div>

                {/* Botón Flotante Fijo en la parte inferior del contenedor */}
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-md border-t border-gray-100 z-10 rounded-b-[2.5rem]">
                    <Button 
                        type="submit"
                        form="expense-form"
                        disabled={isSubmitting} 
                        className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-6 text-lg font-bold rounded-xl shadow-xl shadow-cyan-200 disabled:opacity-70 transition-all flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" />}
                        {isSubmitting ? 'Procesando Documento...' : 'Confirmar Gasto'}
                    </Button>
                </div>
            </div>
        </div>
    );
}