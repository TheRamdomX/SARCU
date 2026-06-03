import { useState } from 'react';
import { Camera, Upload, X, Check } from 'lucide-react';
import { Button } from './button';
import './App.css'
import { Textarea } from './TextArea';
import { Input } from './Inputs';
import { Label } from './Label';
import imageCompression from 'browser-image-compression';
import { supabase } from './lib/supabase';

interface ExpenseFormProps {
    workerName: string;
    availableBalance: number;
    onSubmit: (expense: {
        concept: string;
        amount: number;
        photo: string; // Ahora esto será la URL pública de Supabase
        date: Date;
    }) => void;
    onCancel: () => void;
}

export function ExpenseForm({ workerName, availableBalance, onSubmit, onCancel }: ExpenseFormProps) {
    const [photoPreview, setPhotoPreview] = useState<string | null>(null); // Para mostrar en pantalla
    const [photoFile, setPhotoFile] = useState<File | null>(null); // El archivo real para comprimir/subir
    const [concept, setConcept] = useState('');
    const [amount, setAmount] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false); // Para desactivar el botón mientras sube

    const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file); // 1. Guardamos el archivo original para Supabase

            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result as string); // 2. Guardamos la previsualización para la UI
            };
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

        if (!photoFile) {
            setError('Debes capturar o subir una foto de la boleta');
            return;
        }
        if (!concept.trim()) {
            setError('Debes ingresar el concepto del gasto');
            return;
        }
        if (!amount || isNaN(numAmount) || numAmount <= 0) {
            setError('Debes ingresar un monto válido');
            return;
        }
        if (numAmount > availableBalance) {
            setError(`El monto excede tu saldo disponible ($${availableBalance.toLocaleString('es-CL')})`);
            return;
        }


        setIsSubmitting(true);

        try {
            
            const opcionesCompresion = {
                maxSizeMB: 0.5, // Máximo 500 KB para no gastar los datos del operario
                maxWidthOrHeight: 1024,
                useWebWorker: true,
            };
            const fotoComprimida = await imageCompression(photoFile, opcionesCompresion);

            // 2. Generar nombre único y subir a Supabase Storage (Bucket 'boletas')
            const nombreArchivo = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

            const { error: errorStorage } = await supabase.storage
                .from('SII-CMVT')
                .upload(nombreArchivo, fotoComprimida);

            if (errorStorage) throw errorStorage;

            // 3. Obtener la URL pública de la foto recién subida
            const { data: urlData } = supabase.storage
                .from('SII-CMVT')
                .getPublicUrl(nombreArchivo);

            const fotoUrl = urlData.publicUrl;

            // 4. Enviar al componente padre (Operario.tsx)
            onSubmit({
                concept: concept.trim(),
                amount: numAmount,
                photo: fotoUrl, // ¡Pasamos la URL real de Supabase, no el base64 gigante!
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
        <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-white p-4 pb-20">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl">Reportar Gasto</h1>
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm border border-cyan-100">
                    <p className="text-sm text-gray-600">Trabajador</p>
                    <p className="font-semibold">{workerName}</p>
                    <p className="text-sm text-gray-600 mt-2">Saldo disponible</p>
                    <p className="text-2xl text-cyan-600">${availableBalance.toLocaleString('es-CL')}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Photo Capture */}
                <div>
                    <Label className="text-base mb-3 block">Foto de la Boleta *</Label>
                    {!photoPreview ? (
                        <div className="space-y-3">
                            <Label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-cyan-300 rounded-lg cursor-pointer bg-white hover:bg-cyan-50 transition-colors">
                                <Camera className="h-12 w-12 text-cyan-400 mb-2" />
                                <span className="text-sm text-gray-600">Tomar Foto</span>
                                <Input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handlePhotoCapture}
                                    className="hidden"
                                />
                            </Label>
                            <Label className="flex items-center justify-center w-full py-3 border-2 border-cyan-300 rounded-lg cursor-pointer bg-white hover:bg-cyan-50 transition-colors">
                                <Upload className="h-5 w-5 text-cyan-600 mr-2" />
                                <span className="text-sm text-gray-600">Subir desde Archivo</span>
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handlePhotoCapture}
                                    className="hidden"
                                />
                            </Label>
                        </div>
                    ) : (
                        <div className="relative">
                            <img
                                src={photoPreview}
                                alt="Boleta capturada"
                                className="w-full h-64 object-cover rounded-lg"
                            />
                            <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute top-2 right-2"
                                onClick={handleRemovePhoto}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>

                {/* Concept */}
                <div>
                    <label htmlFor="concept" className="text-base mb-2 block">
                        Descripcion
                    </label>
                    <Textarea
                        id="concept"
                        placeholder="Ej: Materiales de construcción, transporte, alimentación..."
                        value={concept}
                        onChange={(e) => setConcept(e.target.value)}
                        className="min-h-24 resize-none"
                    />
                </div>

                {/* Amount */}
                <div>
                    <label htmlFor="amount" className="text-base mb-2 block">
                        Monto de la Boleta
                    </label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">$</span>
                        <Input
                            id="amount"
                            type="number"
                            placeholder="0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="pl-7 text-lg"
                            inputMode="decimal"
                        />
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                {/* Submit Button */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
                    <Button
                        type="submit"
                        className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-6 text-lg"
                    >
                        <Check className="h-5 w-5 mr-2" />
                        Confirmar Gasto
                    </Button>
                </div>
            </form>
        </div>
    );
}