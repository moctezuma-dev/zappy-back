import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const PROCESSED_EMAILS_DIR = path.join(__dirname, '..', 'processed_emails');
const ANALYSIS_OUTPUT_DIR = path.join(__dirname, '..', 'email_analysis');
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;

// Configuración de análisis (para controlar costos)
const GEMINI_CONFIG = {
  enabled: Boolean(GEMINI_API_KEY),
  maxEmails: parseInt(process.env.GEMINI_MAX_EMAILS || '500'), // Máximo de correos a analizar con Gemini
  minKeywordScore: 3, // Mínimo score de palabras clave para usar Gemini
  useGeminiFor: ['business_proposal', 'important'], // Solo usar Gemini para estas categorías
  batchDelay: 2000 // Pausa entre lotes (ms)
};

// Inicializar Gemini si está disponible
let ai = null;
if (GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

/**
 * Palabras clave para clasificación rápida
 */
const KEYWORDS = {
  business_proposal: [
    'proposal', 'proposal', 'quote', 'quotation', 'deal', 'opportunity',
    'contract', 'agreement', 'partnership', 'collaboration', 'partnership',
    'investment', 'funding', 'budget', 'pricing', 'cost', 'price',
    'offer', 'bid', 'tender', 'rfp', 'rfq', 'sow', 'statement of work',
    'revenue', 'profit', 'margin', 'discount', 'negotiation'
  ],
  important: [
    'urgent', 'important', 'critical', 'priority', 'asap', 'immediate',
    'deadline', 'action required', 'attention', 'confidential',
    'executive', 'ceo', 'cfo', 'director', 'vice president', 'vp',
    'meeting', 'conference', 'presentation', 'board', 'stakeholder'
  ],
  financial: [
    'payment', 'invoice', 'billing', 'accounting', 'finance', 'financial',
    'transaction', 'transfer', 'wire', 'check', 'payment', 'refund',
    'expense', 'reimbursement', 'budget', 'forecast', 'revenue'
  ],
  legal: [
    'legal', 'lawyer', 'attorney', 'litigation', 'lawsuit', 'compliance',
    'regulation', 'regulatory', 'audit', 'legal counsel', 'terms',
    'agreement', 'contract', 'nda', 'non-disclosure'
  ],
  personal: [
    'personal', 'family', 'birthday', 'wedding', 'holiday', 'vacation',
    'thanks', 'thank you', 'congratulations', 'congrats', 'happy',
    'personal matter', 'private'
  ],
  technical: [
    'technical', 'implementation', 'development', 'code', 'software',
    'system', 'integration', 'api', 'database', 'server', 'infrastructure',
    'technical support', 'bug', 'issue', 'error', 'fix'
  ]
};

/**
 * Analiza un correo usando palabras clave
 */
function analyzeWithKeywords(email) {
  const subject = (email.headers.subject || '').toLowerCase();
  const body = (email.body || '').toLowerCase();
  const text = `${subject} ${body}`;
  
  const scores = {
    business_proposal: 0,
    important: 0,
    financial: 0,
    legal: 0,
    personal: 0,
    technical: 0
  };
  
  // Contar coincidencias de palabras clave
  for (const [category, keywords] of Object.entries(KEYWORDS)) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) {
        scores[category] += matches.length;
      }
    }
  }
  
  // Determinar categoría principal
  const maxScore = Math.max(...Object.values(scores));
  const mainCategory = maxScore > 0 
    ? Object.keys(scores).find(key => scores[key] === maxScore)
    : 'general';
  
  // Calcular valor (0-100)
  let valueScore = 0;
  if (scores.business_proposal > 0) valueScore += 40;
  if (scores.important > 0) valueScore += 30;
  if (scores.financial > 0) valueScore += 20;
  if (scores.legal > 0) valueScore += 25;
  if (maxScore > 5) valueScore += 20; // Muchas coincidencias = más importante
  
  valueScore = Math.min(100, valueScore);
  
  return {
    category: mainCategory,
    scores,
    valueScore,
    isValuable: valueScore >= 30,
    isBusinessProposal: scores.business_proposal > 0
  };
}

/**
 * Analiza un correo usando Gemini AI (análisis profundo)
 */
async function analyzeWithGemini(email) {
  if (!ai) {
    return null;
  }
  
  try {
    const subject = email.headers.subject || 'Sin asunto';
    const from = email.headers.from || 'Desconocido';
    const body = email.body.substring(0, 5000); // Limitar tamaño
    
    const prompt = `Analiza este correo electrónico y clasifícalo según su valor e importancia.

Asunto: ${subject}
De: ${from}
Contenido: ${body}

Clasifica el correo en las siguientes categorías:
1. business_proposal: Si contiene propuestas de negocio, ofertas comerciales, oportunidades de negocio
2. important: Si es urgente, importante, requiere acción inmediata
3. financial: Si trata temas financieros, pagos, facturas, presupuestos
4. legal: Si trata temas legales, contratos, compliance
5. personal: Si es personal, no relacionado con negocios
6. technical: Si trata temas técnicos, implementación, soporte técnico
7. general: Si no encaja en ninguna categoría específica

También determina:
- valueScore: Valor del correo (0-100) basado en importancia, urgencia, valor comercial
- isValuable: true si el correo es valioso (valueScore >= 30)
- isBusinessProposal: true si contiene propuestas de negocio
- summary: Resumen breve del contenido (máximo 100 palabras)
- keyPoints: Puntos clave extraídos (array de strings, máximo 5)

Responde SOLO en formato JSON válido:
{
  "category": "business_proposal",
  "valueScore": 75,
  "isValuable": true,
  "isBusinessProposal": true,
  "summary": "...",
  "keyPoints": ["...", "..."]
}`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    });
    
    const text = result?.text || result?.response?.text() || '';
    return JSON.parse(text);
  } catch (error) {
    console.error(`Error en análisis Gemini: ${error.message}`);
    return null;
  }
}

/**
 * Parsea un correo desde su contenido
 */
function parseEmail(content) {
  const lines = content.split('\n');
  const headers = {};
  let bodyStart = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim() === '') {
      bodyStart = i + 1;
      break;
    }
    
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      
      if (headers[key]) {
        headers[key] += ' ' + value;
      } else {
        headers[key] = value;
      }
    }
  }
  
  const body = lines.slice(bodyStart).join('\n').trim();
  
  return { headers, body, raw: content };
}

/**
 * Recorre recursivamente un directorio
 */
function walkDirectory(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDirectory(filePath, fileList);
    } else if (file.endsWith('.eml')) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

/**
 * Agrupa correos por categoría
 */
function groupByCategory(analyses) {
  const groups = {
    business_proposal: [],
    important: [],
    financial: [],
    legal: [],
    personal: [],
    technical: [],
    general: [],
    valuable: [],
    all: analyses
  };
  
  for (const analysis of analyses) {
    if (analysis) {
      groups[analysis.category] = groups[analysis.category] || [];
      groups[analysis.category].push(analysis);
      
      if (analysis.isValuable) {
        groups.valuable.push(analysis);
      }
    }
  }
  
  return groups;
}

/**
 * Genera reportes por categoría
 */
function generateCategoryReports(groups, outputDir) {
  // Crear directorios por categoría
  for (const [category, emails] of Object.entries(groups)) {
    if (category === 'all') continue;
    
    const categoryDir = path.join(outputDir, 'by_category', category);
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }
    
    // Copiar archivos a carpetas por categoría
    for (const email of emails) {
      if (email && email.filePath) {
        const sourcePath = email.filePath;
        const fileName = path.basename(sourcePath);
        const destPath = path.join(categoryDir, fileName);
        
        try {
          fs.copyFileSync(sourcePath, destPath);
        } catch (error) {
          console.error(`Error copiando ${sourcePath}: ${error.message}`);
        }
      }
    }
    
    // Generar reporte JSON de la categoría
    const reportPath = path.join(categoryDir, 'report.json');
    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        category,
        count: emails.length,
        emails: emails.map(e => ({
          fileName: e.fileName,
          subject: e.subject,
          from: e.from,
          date: e.date,
          valueScore: e.valueScore,
          summary: e.summary,
          keyPoints: e.keyPoints
        })),
      }, null, 2),
      'utf-8'
    );
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('Iniciando análisis inteligente de correos...');
  console.log(`Directorio de entrada: ${PROCESSED_EMAILS_DIR}`);
  console.log(`Directorio de salida: ${ANALYSIS_OUTPUT_DIR}`);
  console.log(`Gemini AI: ${ai ? 'Disponible' : 'No disponible (usando solo palabras clave)'}`);
  
  // Crear directorio de salida
  if (!fs.existsSync(ANALYSIS_OUTPUT_DIR)) {
    fs.mkdirSync(ANALYSIS_OUTPUT_DIR, { recursive: true });
  }
  
  // Recopilar archivos
  console.log('Recopilando archivos...');
  const allFiles = walkDirectory(PROCESSED_EMAILS_DIR);
  console.log(`Encontrados ${allFiles.length} archivos`);
  
  // Procesar archivos
  console.log('Analizando correos...');
  console.log(`Configuración Gemini: ${GEMINI_CONFIG.enabled ? 'Habilitado' : 'Deshabilitado'}`);
  if (GEMINI_CONFIG.enabled) {
    console.log(`  - Máximo de correos con Gemini: ${GEMINI_CONFIG.maxEmails}`);
    console.log(`  - Score mínimo para Gemini: ${GEMINI_CONFIG.minKeywordScore * 10}`);
    console.log(`  - Categorías para Gemini: ${GEMINI_CONFIG.useGeminiFor.join(', ')}`);
  }
  
  const analyses = [];
  let processed = 0;
  let geminiCount = 0;
  
  // Primera pasada: análisis rápido con palabras clave
  console.log('\nFase 1: Análisis rápido con palabras clave...');
  const quickAnalyses = [];
  
  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) continue;
    
    const email = parseEmail(content);
    const keywordAnalysis = analyzeWithKeywords(email);
    
    quickAnalyses.push({
      filePath,
      email,
      keywordAnalysis
    });
    
    processed++;
    if (processed % 500 === 0) {
      console.log(`  Analizados: ${processed}/${allFiles.length}`);
    }
  }
  
  // Segunda pasada: seleccionar los mejores candidatos para Gemini
  console.log('\nFase 2: Seleccionando correos para análisis profundo con Gemini...');
  
  // Ordenar por valor y seleccionar los mejores
  const candidatesForGemini = quickAnalyses
    .filter(a => 
      (a.keywordAnalysis.isValuable || a.keywordAnalysis.isBusinessProposal) &&
      a.keywordAnalysis.valueScore >= GEMINI_CONFIG.minKeywordScore * 10 &&
      GEMINI_CONFIG.useGeminiFor.includes(a.keywordAnalysis.category)
    )
    .sort((a, b) => b.keywordAnalysis.valueScore - a.keywordAnalysis.valueScore)
    .slice(0, GEMINI_CONFIG.maxEmails);
  
  console.log(`  Candidatos seleccionados: ${candidatesForGemini.length}`);
  
  // Analizar candidatos con Gemini
  if (GEMINI_CONFIG.enabled && candidatesForGemini.length > 0) {
    console.log('\nFase 3: Análisis profundo con Gemini...');
    for (let i = 0; i < candidatesForGemini.length; i++) {
      const candidate = candidatesForGemini[i];
      const geminiAnalysis = await analyzeWithGemini(candidate.email);
      
      const analysis = {
        fileName: path.basename(candidate.filePath),
        filePath: candidate.filePath,
        messageId: candidate.email.headers['message-id'] || 'N/A',
        subject: candidate.email.headers.subject || 'Sin asunto',
        from: candidate.email.headers.from || 'N/A',
        to: candidate.email.headers.to || 'N/A',
        date: candidate.email.headers.date || 'N/A',
        category: geminiAnalysis?.category || candidate.keywordAnalysis.category,
        valueScore: geminiAnalysis?.valueScore || candidate.keywordAnalysis.valueScore,
        isValuable: geminiAnalysis?.isValuable ?? candidate.keywordAnalysis.isValuable,
        isBusinessProposal: geminiAnalysis?.isBusinessProposal ?? candidate.keywordAnalysis.isBusinessProposal,
        summary: geminiAnalysis?.summary || null,
        keyPoints: geminiAnalysis?.keyPoints || [],
        keywordScores: candidate.keywordAnalysis.scores,
        analysisMethod: geminiAnalysis ? 'gemini' : 'keywords'
      };
      
      analyses.push(analysis);
      if (geminiAnalysis) geminiCount++;
      
      if ((i + 1) % 10 === 0) {
        console.log(`  Procesados con Gemini: ${i + 1}/${candidatesForGemini.length}`);
        // Pausa para no sobrecargar la API
        await new Promise(resolve => setTimeout(resolve, GEMINI_CONFIG.batchDelay));
      }
    }
  }
  
  // Procesar el resto con solo palabras clave
  console.log('\nFase 4: Procesando correos restantes con palabras clave...');
  const processedPaths = new Set(analyses.map(a => a.filePath));
  
  for (const candidate of quickAnalyses) {
    if (processedPaths.has(candidate.filePath)) continue;
    
    const analysis = {
      fileName: path.basename(candidate.filePath),
      filePath: candidate.filePath,
      messageId: candidate.email.headers['message-id'] || 'N/A',
      subject: candidate.email.headers.subject || 'Sin asunto',
      from: candidate.email.headers.from || 'N/A',
      to: candidate.email.headers.to || 'N/A',
      date: candidate.email.headers.date || 'N/A',
      category: candidate.keywordAnalysis.category,
      valueScore: candidate.keywordAnalysis.valueScore,
      isValuable: candidate.keywordAnalysis.isValuable,
      isBusinessProposal: candidate.keywordAnalysis.isBusinessProposal,
      summary: null,
      keyPoints: [],
      keywordScores: candidate.keywordAnalysis.scores,
      analysisMethod: 'keywords'
    };
    
    analyses.push(analysis);
  }
  
  console.log(`\nTotal procesados: ${analyses.length} (Gemini: ${geminiCount}, Keywords: ${analyses.length - geminiCount})`);
  
  // Agrupar por categoría
  console.log('Agrupando correos por categoría...');
  const groups = groupByCategory(analyses);
  
  // Generar reportes
  console.log('Generando reportes...');
  generateCategoryReports(groups, ANALYSIS_OUTPUT_DIR);
  
  // Generar reporte principal
  const mainReport = {
    timestamp: new Date().toISOString(),
    totalEmails: analyses.length,
    analysisMethod: ai ? 'gemini + keywords' : 'keywords',
    geminiAnalyzed: geminiCount,
    categories: {
      business_proposal: groups.business_proposal.length,
      important: groups.important.length,
      financial: groups.financial.length,
      legal: groups.legal.length,
      personal: groups.personal.length,
      technical: groups.technical.length,
      general: groups.general.length,
      valuable: groups.valuable.length
    },
    topValuable: groups.valuable
      .sort((a, b) => b.valueScore - a.valueScore)
      .slice(0, 50)
      .map(e => ({
        subject: e.subject,
        from: e.from,
        valueScore: e.valueScore,
        category: e.category,
        summary: e.summary
      })),
    topBusinessProposals: groups.business_proposal
      .sort((a, b) => b.valueScore - a.valueScore)
      .slice(0, 50)
      .map(e => ({
        subject: e.subject,
        from: e.from,
        valueScore: e.valueScore,
        summary: e.summary,
        keyPoints: e.keyPoints
      }))
  };
  
  const reportPath = path.join(ANALYSIS_OUTPUT_DIR, 'analysis_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(mainReport, null, 2), 'utf-8');
  
  console.log('\n=== Resumen ===');
  console.log(`Total de correos analizados: ${analyses.length}`);
  console.log(`Analizados con Gemini: ${geminiCount}`);
  console.log(`Correos valiosos: ${groups.valuable.length}`);
  console.log(`Propuestas de negocio: ${groups.business_proposal.length}`);
  console.log(`\nCategorías:`);
  for (const [category, count] of Object.entries(mainReport.categories)) {
    console.log(`  ${category}: ${count}`);
  }
  console.log(`\nReporte guardado en: ${reportPath}`);
  console.log(`Correos organizados por categoría en: ${ANALYSIS_OUTPUT_DIR}/by_category/`);
}

// Ejecutar
main().catch(console.error);

