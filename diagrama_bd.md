# Diagrama de Base de Datos — SCG (Sistema de Control de Gastos)

## Diagrama Entidad-Relacion

```
┌─────────────────────────────────────────────┐
│                 auth.users                  │
│           (tabla interna Supabase)          │
├─────────────────────────────────────────────┤
│  id            UUID  PK                     │
│  email         TEXT  UNIQUE NOT NULL        │
│  encrypted_pw  TEXT  NOT NULL               │
│  created_at    TIMESTAMPTZ  DEFAULT now()   │
│  ...           (campos internos de Supabase)│
└──────────────────┬──────────────────────────┘
                   │ 1
                   │
                   │ FK (id)
                   │
                   ▼ 1
┌─────────────────────────────────────────────┐
│                 profiles                    │
├─────────────────────────────────────────────┤
│  id                 UUID  PK  FK(auth.users)│
│  nombre             TEXT                    │
│  email              TEXT                    │
│  rol                TEXT  DEFAULT 'operario'│
│  activo             BOOLEAN  DEFAULT true   │
│  saldo_disponible   BIGINT  DEFAULT 0       │
│  created_at         TIMESTAMPTZ DEFAULT now│
└──────────┬──────────────────┬───────────────┘
           │ 1                │ 1
           │                  │
           │ operario_id      │ contador_id
           │                  │
           ▼ N                ▼ N
┌─────────────────────────────────────────────┐
│                  gastos                     │
├─────────────────────────────────────────────┤
│  id                UUID  PK  DEFAULT uuid() │
│  operario_id       UUID  FK(profiles.id)    │
│  monto             NUMERIC  NOT NULL        │
│  descripcion       TEXT                     │
│  fecha             DATE                     │
│  estado            TEXT  DEFAULT 'pendiente'│
│  comprobante_url   TEXT                     │
│  contador_id       UUID  FK(profiles.id)    │
│  fecha_revision    TIMESTAMPTZ             │
│  motivo_rechazo    TEXT                     │
│  created_at        TIMESTAMPTZ DEFAULT now  │
└─────────────────────────────────────────────┘
```

## Relaciones

```
profiles.id  ──< 1:N >──  gastos.operario_id   (un operario tiene muchos gastos)
profiles.id  ──< 1:N >──  gastos.contador_id    (un contador revisa muchos gastos)
auth.users.id ──< 1:1 >── profiles.id           (cada usuario auth tiene un perfil)
```

## Detalle de Tablas

### Tabla `profiles`

| Columna           | Tipo         | Restricciones                    | Descripcion                        |
|-------------------|-------------|----------------------------------|------------------------------------|
| `id`              | `uuid`      | PK, FK → auth.users.id          | ID del usuario (mismo que auth)    |
| `nombre`          | `text`      |                                  | Nombre completo                    |
| `email`           | `text`      |                                  | Correo electronico                 |
| `rol`             | `text`      | DEFAULT 'operario'               | operario, contador, tecnico        |
| `activo`          | `boolean`   | DEFAULT true                     | Si el usuario puede operar         |
| `saldo_disponible`| `bigint`    | DEFAULT 0                        | Presupuesto asignado al operario   |
| `created_at`      | `timestamptz`| DEFAULT now()                   | Fecha de creacion                  |

### Tabla `gastos`

| Columna           | Tipo         | Restricciones                    | Descripcion                        |
|-------------------|-------------|----------------------------------|------------------------------------|
| `id`              | `uuid`      | PK, DEFAULT gen_random_uuid()    | ID unico del gasto                 |
| `operario_id`     | `uuid`      | FK → profiles.id                 | Quien reporto el gasto             |
| `monto`           | `numeric`   | NOT NULL                         | Monto del gasto                    |
| `descripcion`     | `text`      |                                  | Concepto/descripcion               |
| `fecha`           | `date`      |                                  | Fecha del gasto                    |
| `estado`          | `text`      | DEFAULT 'pendiente'              | pendiente, aprobado, rechazado     |
| `comprobante_url` | `text`      |                                  | URL de la foto de boleta           |
| `contador_id`     | `uuid`      | FK → profiles.id                 | Quien reviso el gasto              |
| `fecha_revision`  | `timestamptz`|                                 | Cuando se reviso                   |
| `motivo_rechazo`  | `text`      |                                  | Motivo si fue rechazado            |
| `created_at`      | `timestamptz`| DEFAULT now()                   | Fecha de registro en el sistema    |

## SQL para crear las tablas en Supabase

Ejecutar este SQL en el **SQL Editor** de Supabase Dashboard:

```sql
-- ============================================================
-- 1. Tabla profiles (enlazada a auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre            TEXT,
    email             TEXT,
    rol               TEXT NOT NULL DEFAULT 'operario'
                      CHECK (rol IN ('operario', 'contador', 'tecnico')),
    activo            BOOLEAN NOT NULL DEFAULT true,
    saldo_disponible  BIGINT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permitir que el service_role lea/escriba
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on profiles"
    ON public.profiles
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Trigger: crear perfil automaticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, nombre)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. Tabla gastos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gastos (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operario_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    monto             NUMERIC NOT NULL CHECK (monto > 0),
    descripcion       TEXT,
    fecha             DATE,
    estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
    comprobante_url   TEXT,
    contador_id       UUID REFERENCES public.profiles(id),
    fecha_revision    TIMESTAMPTZ,
    motivo_rechazo    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on gastos"
    ON public.gastos
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Indices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_gastos_operario  ON public.gastos(operario_id);
CREATE INDEX IF NOT EXISTS idx_gastos_estado    ON public.gastos(estado);
CREATE INDEX IF NOT EXISTS idx_gastos_created   ON public.gastos(created_at DESC);

-- ============================================================
-- 3. Storage bucket para comprobantes
-- ============================================================
-- Ejecutar esto desde el Dashboard de Supabase > Storage > New Bucket
-- Nombre: comprobantes
-- Public: true (o false si se implementan signed URLs)
--
-- O via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', true)
ON CONFLICT (id) DO NOTHING;
```
