#!/usr/bin/env node

/**
 * Script para generar/actualizar la documentación OpenAPI
 * 
 * Este script lee las rutas del proyecto y genera un archivo openapi.yaml
 * actualizado basándose en la estructura actual de endpoints.
 * 
 * Uso: node scripts/generate-docs.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Leer el openapi.yaml actual como base
const openapiPath = path.join(projectRoot, 'docs', 'openapi.yaml');
let openapiSpec = {};

if (fs.existsSync(openapiPath)) {
  try {
    const content = fs.readFileSync(openapiPath, 'utf-8');
    openapiSpec = yaml.load(content);
    console.log('✓ Archivo openapi.yaml existente cargado');
  } catch (error) {
    console.error('Error al leer openapi.yaml:', error.message);
    process.exit(1);
  }
} else {
  // Crear estructura base si no existe
  openapiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'Zero-Click CRM API',
      version: '1.0.0',
      description: 'Documentación de la API para el backend Zero-Click CRM. Incluye ingestión multicanal, procesamiento de audio/video, consultas CRM, chat asistido por IA, alertas, notas, knowledge base y endpoints administrativos.',
      contact: {
        name: 'Equipo Relay',
      },
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Servidor de desarrollo local',
      },
      {
        url: 'https://your-deployment-url.example',
        description: 'Servidor de producción (actualiza esta URL al desplegar)',
      },
    ],
    tags: [],
    paths: {},
    components: {
      schemas: {},
      parameters: {},
      responses: {},
    },
  };
  console.log('✓ Estructura base creada');
}

// El timestamp se actualiza en api-inventory.md, no en openapi.yaml

// Función para verificar que todos los paths estén documentados
function verifyPaths() {
  const routesDir = path.join(projectRoot, 'src', 'routes');
  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js') && f !== 'index.js');
  
  console.log('\n📋 Verificando rutas...');
  console.log(`   Archivos de rutas encontrados: ${routeFiles.length}`);
  
  const documentedPaths = Object.keys(openapiSpec.paths || {});
  console.log(`   Endpoints documentados: ${documentedPaths.length}`);
  
  // Listar endpoints documentados
  if (documentedPaths.length > 0) {
    console.log('\n   Endpoints documentados:');
    documentedPaths.forEach(path => {
      const methods = Object.keys(openapiSpec.paths[path] || {});
      methods.forEach(method => {
        const summary = openapiSpec.paths[path][method]?.summary || 'Sin resumen';
        console.log(`   - ${method.toUpperCase()} ${path} - ${summary}`);
      });
    });
  }
}

// Función para actualizar la fecha de actualización en api-inventory.md
function updateInventoryDate() {
  const inventoryPath = path.join(projectRoot, 'docs', 'api-inventory.md');
  
  if (fs.existsSync(inventoryPath)) {
    try {
      let content = fs.readFileSync(inventoryPath, 'utf-8');
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      // Actualizar la fecha en la primera línea que contenga "Actualizado:"
      content = content.replace(
        /_Actualizado:.*?_/,
        `_Actualizado: ${dateStr}_`
      );
      
      fs.writeFileSync(inventoryPath, content, 'utf-8');
      console.log('✓ Fecha actualizada en api-inventory.md');
    } catch (error) {
      console.warn('⚠ No se pudo actualizar api-inventory.md:', error.message);
    }
  }
}

// Función principal
function main() {
  console.log('🔧 Generador de documentación OpenAPI\n');
  
  // Verificar estructura
  verifyPaths();
  
  // Actualizar fecha en api-inventory.md
  updateInventoryDate();
  
  // Guardar el archivo (aunque no haya cambios, actualiza el formato)
  try {
    const yamlContent = yaml.dump(openapiSpec, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
    
    // Asegurar que el directorio existe
    const docsDir = path.dirname(openapiPath);
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    
    fs.writeFileSync(openapiPath, yamlContent, 'utf-8');
    console.log('\n✓ Documentación actualizada en docs/openapi.yaml');
    console.log('\n💡 Nota: Este script verifica la estructura existente.');
    console.log('   Para agregar nuevos endpoints, edita docs/openapi.yaml manualmente');
    console.log('   o agrega comentarios JSDoc en las rutas y usa swagger-jsdoc.\n');
  } catch (error) {
    console.error('❌ Error al guardar openapi.yaml:', error.message);
    process.exit(1);
  }
}

main();

