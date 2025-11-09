import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio base de correos
const EMAILS_DIR = path.join(__dirname, '..', 'correos_data', 'arnold-j');
// Directorio de salida para los archivos procesados (en la raíz del proyecto)
const OUTPUT_DIR = path.join(__dirname, '..', 'processed_emails');

/**
 * Extrae información del correo desde el contenido
 */
function parseEmail(content) {
  const lines = content.split('\n');
  const headers = {};
  let bodyStart = 0;
  
  // Extraer headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Línea vacía indica fin de headers
    if (line.trim() === '') {
      bodyStart = i + 1;
      break;
    }
    
    // Parsear header
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      
      if (headers[key]) {
        // Si ya existe, concatenar (para headers multilínea)
        headers[key] += ' ' + value;
      } else {
        headers[key] = value;
      }
    }
  }
  
  // Extraer cuerpo del mensaje
  const body = lines.slice(bodyStart).join('\n').trim();
  
  return {
    headers,
    body,
    raw: content
  };
}

/**
 * Genera un nombre de archivo seguro basado en el correo
 */
function generateFileName(email, folderPath, originalName) {
  const headers = email.headers;
  
  // Intentar usar Message-ID como base
  let baseName = 'email';
  if (headers['message-id']) {
    // Extraer parte del Message-ID (antes del @)
    const msgId = headers['message-id'].replace(/[<>]/g, '');
    const msgIdPart = msgId.split('@')[0] || msgId;
    baseName = msgIdPart.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  }
  
  // Agregar fecha si está disponible
  let dateStr = '';
  if (headers.date) {
    try {
      const date = new Date(headers.date);
      if (!isNaN(date.getTime())) {
        dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
      }
    } catch (e) {
      // Ignorar errores de fecha
    }
  }
  
  // Agregar parte del asunto si está disponible
  let subjectPart = '';
  if (headers.subject) {
    subjectPart = headers.subject
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .substring(0, 30)
      .trim()
      .replace(/\s+/g, '_');
  }
  
  // Construir nombre del archivo
  const parts = [baseName];
  if (dateStr) parts.push(dateStr);
  if (subjectPart) parts.push(subjectPart);
  
  let fileName = parts.join('_') || originalName;
  
  // Limpiar nombre de archivo
  fileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
  fileName = fileName.replace(/\s+/g, '_');
  fileName = fileName.substring(0, 200); // Limitar longitud
  
  // Agregar extensión
  return `${fileName}.eml`;
}

/**
 * Genera la ruta de salida basada en la carpeta original
 */
function getOutputPath(originalPath) {
  // Obtener la ruta relativa desde EMAILS_DIR
  const relativePath = path.relative(EMAILS_DIR, originalPath);
  const folder = path.dirname(relativePath);
  
  // Si está en la raíz, usar 'root'
  const outputFolder = folder === '.' ? 'root' : folder;
  
  return path.join(OUTPUT_DIR, outputFolder);
}

/**
 * Procesa un archivo de correo
 */
function processEmailFile(filePath, stats) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    if (!content.trim()) {
      console.warn(`Archivo vacío: ${filePath}`);
      return null;
    }
    
    const email = parseEmail(content);
    const originalName = path.basename(filePath);
    const fileName = generateFileName(email, filePath, originalName);
    const outputFolder = getOutputPath(filePath);
    
    // Crear directorio de salida si no existe
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }
    
    const outputPath = path.join(outputFolder, fileName);
    
    // Si el archivo ya existe, agregar un número
    let finalPath = outputPath;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(fileName);
      const nameWithoutExt = path.basename(fileName, ext);
      finalPath = path.join(outputFolder, `${nameWithoutExt}_${counter}${ext}`);
      counter++;
    }
    
    // Guardar el correo procesado
    fs.writeFileSync(finalPath, content, 'utf-8');
    
    return {
      originalPath: filePath,
      outputPath: finalPath,
      fileName: path.basename(finalPath),
      messageId: email.headers['message-id'] || 'N/A',
      subject: email.headers.subject || 'Sin asunto',
      date: email.headers.date || 'N/A',
      from: email.headers.from || 'N/A',
      to: email.headers.to || 'N/A'
    };
  } catch (error) {
    console.error(`Error procesando ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Recorre recursivamente un directorio buscando archivos de correo
 */
function walkDirectory(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Recursivamente procesar subdirectorios
      walkDirectory(filePath, fileList);
    } else {
      // Es un archivo, agregarlo a la lista
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

/**
 * Función principal
 */
function main() {
  console.log('Iniciando procesamiento de correos...');
  console.log(`Directorio de entrada: ${EMAILS_DIR}`);
  console.log(`Directorio de salida: ${OUTPUT_DIR}`);
  
  // Crear directorio de salida si no existe
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Recopilar todos los archivos
  console.log('Recopilando archivos...');
  const allFiles = walkDirectory(EMAILS_DIR);
  console.log(`Encontrados ${allFiles.length} archivos`);
  
  // Procesar cada archivo
  const results = [];
  let processed = 0;
  let errors = 0;
  
  console.log('Procesando archivos...');
  for (const filePath of allFiles) {
    const result = processEmailFile(filePath);
    
    if (result) {
      results.push(result);
      processed++;
      
      if (processed % 100 === 0) {
        console.log(`Procesados: ${processed}/${allFiles.length}`);
      }
    } else {
      errors++;
    }
  }
  
  // Generar reporte
  const reportPath = path.join(OUTPUT_DIR, 'processing_report.json');
  const report = {
    timestamp: new Date().toISOString(),
    totalFiles: allFiles.length,
    processed: processed,
    errors: errors,
    results: results
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  
  console.log('\n=== Resumen ===');
  console.log(`Total de archivos: ${allFiles.length}`);
  console.log(`Procesados exitosamente: ${processed}`);
  console.log(`Errores: ${errors}`);
  console.log(`Reporte guardado en: ${reportPath}`);
  console.log(`Archivos procesados guardados en: ${OUTPUT_DIR}`);
}

// Ejecutar
main();

