import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
        '⚠️ Alerta: Faltan las variables de entorno de Supabase en el contenedor. ' +
        'El módulo de carga de imágenes (Storage) de las boletas no estará disponible.'
    );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isValidComprobanteSrc(url: string | undefined | null): boolean {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        if (!supabaseUrl) return false;
        const supabaseDomain = new URL(supabaseUrl).hostname;
        return parsed.hostname === supabaseDomain && url.includes('/storage/v1/object/public/comprobantes/');
    } catch {
        return false;
    }
}

export function safeImageSrc(url: string | undefined | null): string {
    return isValidComprobanteSrc(url) ? url! : '';
}