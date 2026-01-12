-- Expandir enum UserRole con nuevos roles educativos
-- Agregar nuevos valores al enum existente

-- Agregar rol DIRECTOR
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'director';

-- Agregar rol COORDINADOR
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'coordinador';

-- Agregar rol PROFESOR
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'profesor';

-- Agregar rol SECRETARIO
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'secretario';

-- Agregar rol PADRE
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'padre';

-- Agregar rol ESTUDIANTE
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'estudiante';

-- Agregar rol MODERADOR
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'moderador';
