-- Fase 1: Estructura Organizacional Educativa
-- Crear enum EducationalLevel, tablas Department, Course, Subject, y junction tables

-- 1. Crear enum EducationalLevel
CREATE TYPE "EducationalLevel" AS ENUM ('PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'BACHILLERATO', 'UNIVERSIDAD');

-- 2. Crear tabla Department
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#3b82f6',
    "icon" TEXT DEFAULT 'Building',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- 3. Crear tabla Course
CREATE TABLE "Course" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" "EducationalLevel" NOT NULL,
    "departmentId" INTEGER,
    "academicYear" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- 4. Crear tabla Subject
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "courseId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- 5. Crear tabla UserCourse (junction table)
CREATE TABLE "UserCourse" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TEACHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCourse_pkey" PRIMARY KEY ("id")
);

-- 6. Crear tabla UserSubject (junction table)
CREATE TABLE "UserSubject" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSubject_pkey" PRIMARY KEY ("id")
);

-- 7. Agregar campos organizacionales a User
ALTER TABLE "User" ADD COLUMN "departmentId" INTEGER;
ALTER TABLE "User" ADD COLUMN "phoneNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "position" TEXT;

-- 8. Agregar relaciones organizacionales a Document
ALTER TABLE "Document" ADD COLUMN "courseId" INTEGER;
ALTER TABLE "Document" ADD COLUMN "subjectId" INTEGER;

-- 9. Crear constraints UNIQUE
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");
CREATE UNIQUE INDEX "Course_code_academicYear_key" ON "Course"("code", "academicYear");
CREATE UNIQUE INDEX "Subject_code_key" ON "Subject"("code");
CREATE UNIQUE INDEX "UserCourse_userId_courseId_key" ON "UserCourse"("userId", "courseId");
CREATE UNIQUE INDEX "UserSubject_userId_subjectId_key" ON "UserSubject"("userId", "subjectId");

-- 10. Crear índices para optimización de queries
CREATE INDEX "Department_code_idx" ON "Department"("code");
CREATE INDEX "Department_name_idx" ON "Department"("name");
CREATE INDEX "Department_isActive_idx" ON "Department"("isActive");

CREATE INDEX "Course_level_idx" ON "Course"("level");
CREATE INDEX "Course_departmentId_idx" ON "Course"("departmentId");
CREATE INDEX "Course_academicYear_idx" ON "Course"("academicYear");
CREATE INDEX "Course_isActive_idx" ON "Course"("isActive");

CREATE INDEX "Subject_courseId_idx" ON "Subject"("courseId");
CREATE INDEX "Subject_code_idx" ON "Subject"("code");
CREATE INDEX "Subject_isActive_idx" ON "Subject"("isActive");

CREATE INDEX "UserCourse_userId_idx" ON "UserCourse"("userId");
CREATE INDEX "UserCourse_courseId_idx" ON "UserCourse"("courseId");

CREATE INDEX "UserSubject_userId_idx" ON "UserSubject"("userId");
CREATE INDEX "UserSubject_subjectId_idx" ON "UserSubject"("subjectId");

CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

CREATE INDEX "Document_courseId_idx" ON "Document"("courseId");
CREATE INDEX "Document_subjectId_idx" ON "Document"("subjectId");

-- 11. Agregar foreign keys
ALTER TABLE "Course" ADD CONSTRAINT "Course_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Subject" ADD CONSTRAINT "Subject_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSubject" ADD CONSTRAINT "UserSubject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSubject" ADD CONSTRAINT "UserSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
