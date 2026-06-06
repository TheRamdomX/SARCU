import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
        '⚠️ Alerta: Faltan las variables de entorno de Supabase en el contenedor. ' +
        'El módulo de carga de imágenes (Storage) de las boletas no estará disponible.'
    );
}

// Inicialización segura que no rompe el renderizado principal del árbol de React
export const supabase = createClient(supabaseUrl, supabaseAnonKey);