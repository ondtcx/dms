/**
 * Script de validación del pipeline de firma electrónica PAdES
 * Ejecutar con: npx ts-node test-signature/test-sign.ts
 *
 * Prueba: PDF real de Puppeteer → pdf-lib placeholder → @signpdf firma → PDF firmado
 */

import { PDFDocument } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import * as fs from 'fs';
import * as path from 'path';
import * as forge from 'node-forge';

const P12_PATH = path.join(__dirname, 'test-firma.p12');
const P12_PIN = 'Demo123!';

// PDF real generado por Puppeteer en el sistema
const PDF_PATH = path.join(__dirname, '../uploads/1767424126865-certificado-2026-01-03-1767424124039.pdf');

const OUTPUT_PATH = path.join(__dirname, 'signed-output.pdf');

async function main() {
  console.log('\n=== TEST PIPELINE FIRMA ELECTRÓNICA PAdES ===\n');

  // ── PASO 1: Leer archivos ──────────────────────────────────────────────────
  console.log('1. Leyendo archivos...');

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`   ✗ PDF no encontrado: ${PDF_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(P12_PATH)) {
    console.error(`   ✗ .p12 no encontrado: ${P12_PATH}`);
    process.exit(1);
  }

  const pdfBytes = fs.readFileSync(PDF_PATH);
  const p12Buffer = fs.readFileSync(P12_PATH);
  console.log(`   ✓ PDF: ${(pdfBytes.length / 1024).toFixed(1)} KB`);
  console.log(`   ✓ .p12: ${(p12Buffer.length / 1024).toFixed(1)} KB`);

  // ── PASO 2: Parsear .p12 y extraer datos del firmante ─────────────────────
  console.log('\n2. Parseando certificado .p12...');
  try {
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Buffer.toString('binary')));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, P12_PIN);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag];

    if (!certBag || certBag.length === 0) {
      throw new Error('No se encontró certificado en el .p12');
    }

    const cert = certBag[0].cert!;
    const cn = cert.subject.getField('CN')?.value ?? 'N/A';
    const org = cert.subject.getField('O')?.value ?? 'N/A';
    const issuerCN = cert.issuer.getField('CN')?.value ?? 'N/A';
    const notBefore = cert.validity.notBefore;
    const notAfter = cert.validity.notAfter;

    console.log(`   ✓ Titular: ${cn} (${org})`);
    console.log(`   ✓ Emisor: ${issuerCN}`);
    console.log(`   ✓ Válido: ${notBefore.toLocaleDateString()} → ${notAfter.toLocaleDateString()}`);
    console.log(`   ✓ Serial: ${cert.serialNumber}`);
  } catch (err: any) {
    console.error(`   ✗ Error parseando .p12: ${err.message}`);
    process.exit(1);
  }

  // ── PASO 3: Cargar PDF con pdf-lib ────────────────────────────────────────
  console.log('\n3. Cargando PDF con pdf-lib...');
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    console.log(`   ✓ Páginas: ${pdfDoc.getPageCount()}`);
    console.log(`   ✓ Título: ${pdfDoc.getTitle() ?? '(sin título)'}`);
  } catch (err: any) {
    console.error(`   ✗ pdf-lib no pudo cargar el PDF: ${err.message}`);
    console.error('   → El PDF de Puppeteer puede tener estructura incompatible con pdf-lib');
    process.exit(1);
  }

  // ── PASO 4: Inyectar placeholder PAdES ───────────────────────────────────
  console.log('\n4. Inyectando placeholder de firma PAdES...');
  try {
    pdflibAddPlaceholder({
      pdfDoc,
      reason: 'Firma electrónica institucional',
      contactInfo: 'rector@colegio.edu',
      name: 'Rector Prueba',
      location: 'Ecuador',
      signatureLength: 16384, // espacio para certificados reales más grandes
    });
    console.log('   ✓ Placeholder inyectado');
  } catch (err: any) {
    console.error(`   ✗ Error inyectando placeholder: ${err.message}`);
    process.exit(1);
  }

  // ── PASO 5: Serializar PDF con placeholder ────────────────────────────────
  console.log('\n5. Serializando PDF con placeholder...');
  let pdfWithPlaceholder: Buffer;
  try {
    const savedBytes = await pdfDoc.save();
    pdfWithPlaceholder = Buffer.from(savedBytes);
    console.log(`   ✓ PDF con placeholder: ${(pdfWithPlaceholder.length / 1024).toFixed(1)} KB`);
  } catch (err: any) {
    console.error(`   ✗ Error serializando PDF: ${err.message}`);
    process.exit(1);
  }

  // ── PASO 6: Firmar PDF con @signpdf ──────────────────────────────────────
  console.log('\n6. Aplicando firma PAdES con @signpdf...');
  let signedPdf: Buffer;
  try {
    const signer = new P12Signer(p12Buffer, { passphrase: P12_PIN });
    signedPdf = await new SignPdf().sign(pdfWithPlaceholder, signer);
    console.log(`   ✓ PDF firmado: ${(signedPdf.length / 1024).toFixed(1)} KB`);
    console.log(`   ✓ Diferencia de tamaño: +${((signedPdf.length - pdfBytes.length) / 1024).toFixed(1)} KB (bloque PKCS#7)`);
  } catch (err: any) {
    console.error(`   ✗ Error firmando PDF: ${err.message}`);
    if (err.message.includes('placeholder')) {
      console.error('   → Problema con el ByteRange placeholder. Intentar con useObjectStreams: false en pdf-lib');
    }
    process.exit(1);
  }

  // ── PASO 7: Guardar resultado ─────────────────────────────────────────────
  console.log('\n7. Guardando PDF firmado...');
  fs.writeFileSync(OUTPUT_PATH, signedPdf);
  console.log(`   ✓ Guardado en: ${OUTPUT_PATH}`);

  // ── RESULTADO ─────────────────────────────────────────────────────────────
  console.log('\n=== RESULTADO ===');
  console.log('✓ Pipeline completo exitoso');
  console.log('\nPróximos pasos para verificar:');
  console.log('  1. Abrir signed-output.pdf en Adobe Acrobat Reader');
  console.log('  2. Debe mostrar panel "Firmas" con la firma aplicada');
  console.log('  3. La firma dirá "Firmado por Director Prueba" con advertencia de CA no confiable (normal en pruebas)');
  console.log('\nSi Adobe muestra la firma → el pipeline es válido para producción con certificados reales.\n');
}

main().catch((err) => {
  console.error('\n✗ Error inesperado:', err);
  process.exit(1);
});
