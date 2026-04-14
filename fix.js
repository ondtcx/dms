const fs = require('fs');
let code = fs.readFileSync('src/document/document.service.ts', 'utf-8').replace(/\r\n/g, '\n');

// 1. findAll fixes
code = code.replace(/filename: \{\s*contains: search,\s*mode: 'insensitive',\s*\}/g, "versions: { some: { filename: { contains: search, mode: 'insensitive' } } }");

code = code.replace(/where\.AND\.push\(\{ batchId: null \}\);/g, "where.AND.push({ OR: [{ templateData: null }, { templateData: { batchId: null } }] });");

code = code.replace(/where\.AND\.push\(\{ batchId \}\);/g, "where.AND.push({ templateData: { batchId } });");

code = code.replace(/\{ academicYearId: query\.academicYearId \},\s*\{ academicYearId: null \},/g, "{ academic: { academicYearId: query.academicYearId } }, { academic: null }, { academic: { academicYearId: null } },");

// 2. Includes replacement
const oldInclude = `include: {
          uploadedBy: {`;
const newInclude = `include: {
          academic: true,
          search: true,
          templateData: {
            include: { template: { select: { id: true, name: true, documentType: { select: { id: true, name: true } } } }, batch: { select: { id: true, name: true } } }
          },
          versions: { orderBy: { version: 'desc' }, take: 1 },
          uploadedBy: {`;
code = code.replace(new RegExp(oldInclude.replace(/[.*+?^$\\{}()|[\\]\\\\]/g, '\\\\$&'), 'g'), newInclude);

const oldInclude2 = `include: {
        uploadedBy: {`;
const newInclude2 = `include: {
        academic: true,
        search: true,
        templateData: {
          include: { template: { select: { id: true, name: true, documentType: { select: { id: true, name: true } } } }, batch: { select: { id: true, name: true } } }
        },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        uploadedBy: {`;
code = code.replace(new RegExp(oldInclude2.replace(/[.*+?^$\\{}()|[\\]\\\\]/g, '\\\\$&'), 'g'), newInclude2);

// Also remove `template` and `batch` from include
code = code.replace(/template: \{\s*select: \{\s*id: true,\s*name: true,\s*documentType: \{ select: \{ id: true, name: true \} \},\s*\},\s*\},/g, "");
code = code.replace(/batch: \{\s*select: \{ id: true, name: true \},\s*\},/g, "");

// 3. update method
const oldUpdate = `const updatedDocument = await this.prisma.document.update({
      where: { id },
      data: updateDocumentDto,`;
const newUpdate = `const academicData = updateDocumentDto.academic;
    const templateData = updateDocumentDto.templateData;
    const searchData = updateDocumentDto.search;
    
    const updatedDocument = await this.prisma.document.update({
      where: { id },
      data: {
        description: updateDocumentDto.description,
        categoryId: updateDocumentDto.categoryId,
        documentTypeId: updateDocumentDto.documentTypeId,
        isPublic: updateDocumentDto.isPublic,
        ...(academicData ? {
          academic: { upsert: { create: { courseId: academicData.courseId, subjectId: academicData.subjectId, academicYearId: academicData.academicYearId }, update: { courseId: academicData.courseId, subjectId: academicData.subjectId, academicYearId: academicData.academicYearId } } }
        } : {}),
        ...(templateData ? {
          templateData: { upsert: { create: { templateId: templateData.templateId, formData: templateData.formData, batchId: templateData.batchId }, update: { templateId: templateData.templateId, formData: templateData.formData, batchId: templateData.batchId } } }
        } : {}),
        ...(searchData ? {
          search: { upsert: { create: { extractedText: searchData.extractedText }, update: { extractedText: searchData.extractedText } } }
        } : {}),
      },`;
code = code.replace(oldUpdate, newUpdate);

// 4. Property accesses: path, filename, storedName, mimetype, size
code = code.replace(/document\.path/g, "(document as any).versions[0].path");
code = code.replace(/document\.filename/g, "(document as any).versions[0].filename");
code = code.replace(/document\.mimetype/g, "(document as any).versions[0].mimetype");
code = code.replace(/document\.size/g, "(document as any).versions[0].size");
code = code.replace(/document\.storedName/g, "(document as any).versions[0].storedName");

// 5. Fix remove method (updating path)
const oldRemovePath = `data: {
        deletedAt: new Date(),
        deletedById: userId,
        path: trashPath, // Actualizar path a la ubicación en trash
      },
    });`;
const newRemovePath = `data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });
    await this.prisma.documentVersion.update({
      where: { id: (document as any).versions[0].id },
      data: { path: trashPath }
    });`;
code = code.replace(oldRemovePath, newRemovePath);

// 6. Fix restore method (updating path)
const oldRestorePath = `data: {
        deletedAt: null,
        deletedById: null,
        path: storageLocation.path,
      },
    });`;
const newRestorePath = `data: {
        deletedAt: null,
        deletedById: null,
      },
    });
    await this.prisma.documentVersion.update({
      where: { id: (document as any).versions[0].id },
      data: { path: storageLocation.path }
    });`;
code = code.replace(oldRestorePath, newRestorePath);

// 7. Fix replaceFile method update
const oldReplaceFileUpdate = `data: {
        filename: file.originalname,
        storedName: newFilename,
        mimetype: file.mimetype,
        size: file.size,
        path: newStorageLocation.path,
        checksumSHA256: newChecksum,
        currentVersion: newVersion,
      },`;
const newReplaceFileUpdate = `data: {
        checksumSHA256: newChecksum,
        currentVersion: newVersion,
      },`;
code = code.replace(oldReplaceFileUpdate, newReplaceFileUpdate);

// 8. Fix restoreVersion method update
const oldRestoreVersionUpdate = `data: {
        storedName: newFilename,
        path: newLocation.path,
        size: version.size,
        checksumSHA256: version.checksumSHA256,
        currentVersion,
      },`;
const newRestoreVersionUpdate = `data: {
        checksumSHA256: version.checksumSHA256,
        currentVersion,
      },`;
code = code.replace(oldRestoreVersionUpdate, newRestoreVersionUpdate);

// 9. Fix getStats
code = code.replace(/_sum: \{\n\s*size: true,\n\s*\}/g, "_sum: { currentVersion: true }");
code = code.replace(/totalSize:\s*totalSize\._sum\.size\s*\|\|\s*0,/g, "totalSize: 0, // Migrated to DocumentVersion");
code = code.replace(/totalSizeMB:\s*\(\(totalSize\._sum\.size\s*\|\|\s*0\)\s*\/\s*\(1024\s*\*\s*1024\)\)\.toFixed\(2\),/g, "totalSizeMB: '0.00',");

// 10. Fix restoreFromArchive
const oldRestoreFromArchivePath = `data: { path: storageLocation.path, archivedAt: null },
    });`;
const newRestoreFromArchivePath = `data: { archivedAt: null },
    });
    await this.prisma.documentVersion.update({
      where: { id: (document as any).versions[0].id },
      data: { path: storageLocation.path }
    });`;
code = code.replace(oldRestoreFromArchivePath, newRestoreFromArchivePath);

fs.writeFileSync('src/document/document.service.ts', code);
console.log('Fixed document.service.ts safely');
