/**
 * ثاقب — Thaqib VC Platform
 * app.js — Scoring Engine + Data Utilities
 * Version 1.0
 */

// ══════════════════════════════════════
// 1. DATA LOADER
// ══════════════════════════════════════

let DATA = null;

async function loadData() {
  const resp = await fetch('data/vc-data.json');
  DATA = await resp.json();
  calculateAllScores();
  return DATA;
}

// ══════════════════════════════════════
// 2. SCORING ENGINE — SECTORS
// ══════════════════════════════════════

const SECTOR_WEIGHTS = {
  tam: 0.20,
  growth: 0.20,
  deals: 0.15,
  funding: 0.15,
  competition: 0.15,
  vision2030: 0.15
};

// Auto-calculate deals count and funding for a sector
function getSectorAutoScores(sectorId) {
  const rounds = DATA.rounds.filter(r => {
    const company = DATA.companies.find(c => c.id === r.companyId);
    return company && company.sectorId === sectorId;
  });

  const now = new Date();
  const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
  const recentRounds = rounds.filter(r => new Date(r.date) >= twoYearsAgo);

  // Deals score (last 24 months)
  const dealCount = recentRounds.length;
  let dealsScore;
  if (dealCount > 20) dealsScore = 5;
  else if (dealCount > 10) dealsScore = 4;
  else if (dealCount > 5) dealsScore = 3;
  else if (dealCount > 1) dealsScore = 2;
  else dealsScore = 1;

  // Funding score (total)
  const totalFunding = rounds.reduce((sum, r) => sum + (r.amountUSD || 0), 0);
  let fundingScore;
  if (totalFunding > 500000000) fundingScore = 5;
  else if (totalFunding > 200000000) fundingScore = 4;
  else if (totalFunding > 50000000) fundingScore = 3;
  else if (totalFunding > 10000000) fundingScore = 2;
  else fundingScore = 1;

  return { deals: dealsScore, funding: fundingScore, dealCount, totalFunding };
}

function calculateSectorScore(sector) {
  const auto = getSectorAutoScores(sector.id);
  const s = sector.scoring;

  s.deals = auto.deals;
  s.funding = auto.funding;
  s.dealCount = auto.dealCount;
  s.totalFunding = auto.totalFunding;

  s.totalScore = parseFloat((
    (s.tam || 0) * SECTOR_WEIGHTS.tam +
    (s.growth || 0) * SECTOR_WEIGHTS.growth +
    s.deals * SECTOR_WEIGHTS.deals +
    s.funding * SECTOR_WEIGHTS.funding +
    (s.competition || 0) * SECTOR_WEIGHTS.competition +
    (s.vision2030 || 0) * SECTOR_WEIGHTS.vision2030
  ).toFixed(2));

  s.rating = getScoreRating(s.totalScore);
  s.companyCount = DATA.companies.filter(c => c.sectorId === sector.id).length;

  // Risk flags
  s.riskFlags = [];
  if ((s.competition || 0) <= 2) s.riskFlags.push({ type: 'red', label: 'سوق مشبع' });
  if ((s.growth || 0) <= 2) s.riskFlags.push({ type: 'orange', label: 'نمو بطيء' });
  if (s.deals <= 2) s.riskFlags.push({ type: 'orange', label: 'صفقات قليلة' });
  if ((s.vision2030 || 0) <= 2) s.riskFlags.push({ type: 'yellow', label: 'دعم حكومي محدود' });
}

// ══════════════════════════════════════
// 3. SCORING ENGINE — COMPANIES
// ══════════════════════════════════════

const COMPANY_WEIGHTS = {
  stage: 0.10,
  businessModel: 0.15,
  team: 0.20,
  growth: 0.20,
  investorQuality: 0.15,
  expansion: 0.10,
  regulatoryRisk: 0.10
};

// Auto-calculate investor quality from rounds
function getInvestorQuality(companyId) {
  const rounds = DATA.rounds.filter(r => r.companyId === companyId);
  if (rounds.length === 0) return 1;

  const investorIds = [...new Set(rounds.flatMap(r => r.investorIds || []))];
  const investors = investorIds.map(id => DATA.investors.find(i => i.id === id)).filter(Boolean);

  // Tier scoring
  const tier1 = ['sanabil', 'mubadala', 'sequoia-india', 'wellington', 'prosus'];
  const tier2 = ['stv', 'svc-fund', 'impact46', 'raed', 'snb-capital', 'investcorp'];

  const hasTier1 = investors.some(i => tier1.includes(i.id));
  const hasTier2 = investors.some(i => tier2.includes(i.id));
  const hasGov = investors.some(i => i.type === 'government');

  if (hasTier1 || (hasGov && investors.length >= 2)) return 5;
  if (hasTier2) return 4;
  if (investors.length >= 2) return 3;
  if (investors.length === 1) return 2;
  return 1;
}

function calculateCompanyScore(company) {
  const s = company.scoring;

  s.investorQuality = getInvestorQuality(company.id);

  s.totalScore = parseFloat((
    (s.stage || 0) * COMPANY_WEIGHTS.stage +
    (s.businessModel || 0) * COMPANY_WEIGHTS.businessModel +
    (s.team || 0) * COMPANY_WEIGHTS.team +
    (s.growth || 0) * COMPANY_WEIGHTS.growth +
    s.investorQuality * COMPANY_WEIGHTS.investorQuality +
    (s.expansion || 0) * COMPANY_WEIGHTS.expansion +
    (s.regulatoryRisk || 0) * COMPANY_WEIGHTS.regulatoryRisk
  ).toFixed(2));

  s.rating = getScoreRating(s.totalScore);

  // Risk flags
  s.riskFlags = [];
  if ((s.regulatoryRisk || 0) <= 2) s.riskFlags.push({ type: 'red', icon: '🚩', label: 'مخاطر تنظيمية' });
  if ((s.team || 0) <= 2) s.riskFlags.push({ type: 'red', icon: '🚩', label: 'فريق ضعيف' });
  if ((s.businessModel || 0) <= 2) s.riskFlags.push({ type: 'orange', icon: '⚠️', label: 'نموذج أعمال غير مثبت' });
  if ((s.growth || 0) <= 2) s.riskFlags.push({ type: 'orange', icon: '⚠️', label: 'نمو ضعيف' });
  if (s.investorQuality <= 2) s.riskFlags.push({ type: 'orange', icon: '⚠️', label: 'تمويل ضعيف' });
  if ((s.expansion || 0) <= 2) s.riskFlags.push({ type: 'yellow', icon: '💡', label: 'توسع محدود' });

  // Total funding
  const rounds = DATA.rounds.filter(r => r.companyId === company.id);
  s.totalFunding = rounds.reduce((sum, r) => sum + (r.amountUSD || 0), 0);
  s.roundCount = rounds.length;
  s.lastRound = rounds.sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

// ══════════════════════════════════════
// 4. CALCULATE ALL
// ══════════════════════════════════════

function calculateAllScores() {
  DATA.sectors.forEach(s => calculateSectorScore(s));
  DATA.companies.forEach(c => calculateCompanyScore(c));
}

// ══════════════════════════════════════
// 5. UTILITY FUNCTIONS
// ══════════════════════════════════════

function getScoreRating(score) {
  if (score >= 4.0) return 'high';
  if (score >= 3.0) return 'medium';
  if (score >= 2.0) return 'low';
  return 'avoid';
}

function getRatingAr(rating) {
  const map = { high: 'جاذبية عالية', medium: 'جاذبية متوسطة', low: 'جاذبية منخفضة', avoid: 'غير جاذبة' };
  return map[rating] || '';
}

function getRatingColor(rating) {
  const map = { high: '#00cec9', medium: '#fdcb6e', low: '#f97316', avoid: '#ff6b6b' };
  return map[rating] || '#9ca3af';
}

function getRatingEmoji(rating) {
  const map = { high: '🟢', medium: '🟡', low: '🟠', avoid: '🔴' };
  return map[rating] || '⚪';
}

function formatMoney(usd) {
  if (!usd) return 'غير معلن';
  if (usd >= 1000000000) return '$' + (usd / 1000000000).toFixed(1) + 'B';
  if (usd >= 1000000) return '$' + (usd / 1000000).toFixed(0) + 'M';
  if (usd >= 1000) return '$' + (usd / 1000).toFixed(0) + 'K';
  return '$' + usd;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return months[d.getMonth()] + ' ' + d.getFullYear();
}

function getStageAr(stage) {
  const map = {
    'pre-seed': 'Pre-seed', 'seed': 'Seed', 'series-a': 'Series A',
    'series-b': 'Series B', 'series-c+': 'Series C+', 'bridge': 'Bridge',
    'debt': 'Debt', 'grant': 'منحة', 'exit': 'Exit'
  };
  return map[stage] || stage;
}

function getSourceInfo(sourceId) {
  if (!DATA) return { icon: '⬜', color: '#9ca3af', nameAr: 'غير معروف' };
  return DATA.sources.find(s => s.id === sourceId) || { icon: '⬜', color: '#9ca3af', nameAr: 'غير معروف' };
}

function getCompanyRounds(companyId) {
  return DATA.rounds
    .filter(r => r.companyId === companyId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function getSector(sectorId) {
  return DATA.sectors.find(s => s.id === sectorId);
}

function getInvestor(investorId) {
  return DATA.investors.find(i => i.id === investorId);
}

// KPI helpers
function getTotalFunding() {
  return DATA.rounds.reduce((sum, r) => sum + (r.amountUSD || 0), 0);
}

function getHighOpportunities() {
  return DATA.companies.filter(c => c.scoring.rating === 'high');
}

function getRecentRounds(limit = 5) {
  return DATA.rounds
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
}

function getTopSectors(limit = 5) {
  return [...DATA.sectors]
    .sort((a, b) => b.scoring.totalScore - a.scoring.totalScore)
    .slice(0, limit);
}

function getTopCompanies(limit = 10) {
  return [...DATA.companies]
    .sort((a, b) => b.scoring.totalScore - a.scoring.totalScore)
    .slice(0, limit);
}

function getAllRiskFlags() {
  const flags = [];
  DATA.companies.forEach(c => {
    c.scoring.riskFlags.forEach(f => {
      flags.push({ ...f, entity: c.nameAr, entityType: 'company' });
    });
  });
  DATA.sectors.forEach(s => {
    s.scoring.riskFlags.forEach(f => {
      flags.push({ ...f, entity: s.nameAr, entityType: 'sector' });
    });
  });
  return flags;
}

// ══════════════════════════════════════
// 6. DATA IMPORT ENGINE
// ══════════════════════════════════════

/**
 * CSV Parser — lightweight, handles quotes and Arabic
 */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  
  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = parseLine(l);
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    return obj;
  });

  return { headers, rows };
}

/**
 * Field Mapping — maps external field names to our schema
 */
const FIELD_MAPS = {
  magnitt: {
    company: {
      'Company Name': 'nameEn', 'Company Name (Arabic)': 'nameAr',
      'Sector': '_sectorMap', 'Stage': '_stageMap', 'Founded': 'foundedYear',
      'City': 'city', 'Website': 'website', 'Employees': '_employeeMap',
      'Description': 'description', 'Founders': '_foundersSplit'
    },
    round: {
      'Company Name': '_companyLookup', 'Round Type': '_stageMap',
      'Amount (USD)': '_parseNum', 'Date': 'date',
      'Lead Investor': '_investorLookup', 'Investors': '_investorsSplit'
    }
  },
  svc: {
    company: {
      'اسم الشركة': 'nameAr', 'Company': 'nameEn',
      'القطاع': '_sectorMap', 'المرحلة': '_stageMap',
      'سنة التأسيس': 'foundedYear', 'المدينة': 'city'
    },
    round: {
      'الشركة': '_companyLookup', 'نوع الجولة': '_stageMap',
      'المبلغ (دولار)': '_parseNum', 'التاريخ': 'date',
      'المستثمر القائد': '_investorLookup'
    }
  },
  generic: {
    company: {
      'name': 'nameEn', 'nameAr': 'nameAr', 'nameEn': 'nameEn',
      'sector': '_sectorMap', 'stage': '_stageMap',
      'founded': 'foundedYear', 'foundedYear': 'foundedYear',
      'city': 'city', 'website': 'website', 'description': 'description'
    },
    round: {
      'company': '_companyLookup', 'type': '_stageMap',
      'amount': '_parseNum', 'amountUSD': '_parseNum',
      'date': 'date', 'leadInvestor': '_investorLookup'
    }
  }
};

/**
 * Transform helpers
 */
const SECTOR_NAME_MAP = {
  'fintech': 'fintech', 'تقنية مالية': 'fintech', 'financial technology': 'fintech',
  'e-commerce': 'ecommerce', 'ecommerce': 'ecommerce', 'تجارة إلكترونية': 'ecommerce',
  'logistics': 'logistics', 'لوجستيك': 'logistics', 'supply chain': 'logistics',
  'healthtech': 'healthtech', 'health tech': 'healthtech', 'تقنية صحية': 'healthtech',
  'edtech': 'edtech', 'education': 'edtech', 'تقنية تعليمية': 'edtech',
  'proptech': 'proptech', 'real estate': 'proptech', 'تقنية عقارية': 'proptech',
  'foodtech': 'foodtech', 'food': 'foodtech', 'تقنية غذائية': 'foodtech',
  'saas': 'saas', 'software': 'saas', 'برمجيات': 'saas',
  'entertainment': 'entertainment', 'ترفيه': 'entertainment',
  'cleantech': 'cleantech', 'energy': 'cleantech', 'تقنية نظيفة': 'cleantech'
};

const STAGE_NAME_MAP = {
  'pre-seed': 'pre-seed', 'pre seed': 'pre-seed',
  'seed': 'seed', 'بذرة': 'seed',
  'series a': 'series-a', 'series-a': 'series-a', 'جولة أ': 'series-a',
  'series b': 'series-b', 'series-b': 'series-b', 'جولة ب': 'series-b',
  'series c': 'series-c+', 'series c+': 'series-c+', 'series-c+': 'series-c+',
  'bridge': 'bridge', 'debt': 'debt', 'grant': 'grant', 'exit': 'exit'
};

function transformField(key, value) {
  if (!value || value === '') return null;
  if (key === '_sectorMap') return SECTOR_NAME_MAP[value.toLowerCase().trim()] || null;
  if (key === '_stageMap') return STAGE_NAME_MAP[value.toLowerCase().trim()] || null;
  if (key === '_parseNum') return parseFloat(String(value).replace(/[,$\s]/g, '')) || 0;
  if (key === '_foundersSplit') return value.split(/[,،]/).map(s => s.trim()).filter(Boolean);
  if (key === '_investorsSplit') return value.split(/[,،]/).map(s => s.trim()).filter(Boolean);
  if (key === '_employeeMap') {
    const n = parseInt(value);
    if (n > 500) return '501+';
    if (n > 200) return '201-500';
    if (n > 50) return '51-200';
    if (n > 10) return '11-50';
    return '1-10';
  }
  return value;
}

/**
 * Import companies from parsed rows
 */
function importCompanies(rows, sourceId, fieldMap) {
  const log = [];
  let added = 0, skipped = 0;

  rows.forEach((row, i) => {
    try {
      const mapped = {};
      Object.entries(fieldMap).forEach(([csvField, schemaField]) => {
        if (row[csvField] !== undefined) {
          const val = transformField(schemaField, row[csvField]);
          if (val !== null) {
            if (schemaField.startsWith('_')) {
              // Special mappings
              if (schemaField === '_sectorMap') mapped.sectorId = val;
              else if (schemaField === '_stageMap') mapped.stage = val;
              else if (schemaField === '_foundersSplit') mapped.founders = val;
              else if (schemaField === '_employeeMap') mapped.employeeRange = val;
            } else {
              mapped[schemaField] = val;
            }
          }
        }
      });

      // Validate required
      const name = mapped.nameEn || mapped.nameAr;
      if (!name) { log.push({ type: 'warn', msg: `سطر ${i + 2}: لا يوجد اسم — تم تخطيه` }); skipped++; return; }

      // Check duplicate
      const id = (mapped.nameEn || mapped.nameAr || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (DATA.companies.find(c => c.id === id)) { log.push({ type: 'warn', msg: `${name}: موجودة مسبقاً — تم تخطيها` }); skipped++; return; }

      // Build company object
      const company = {
        id,
        nameAr: mapped.nameAr || mapped.nameEn || '',
        nameEn: mapped.nameEn || mapped.nameAr || '',
        logo: '', sectorId: mapped.sectorId || 'saas',
        stage: mapped.stage || 'seed',
        foundedYear: parseInt(mapped.foundedYear) || null,
        city: mapped.city || '', website: mapped.website || '',
        employeeRange: mapped.employeeRange || '',
        description: mapped.description || '',
        founders: mapped.founders || [],
        tags: [], scoring: {
          stage: 3, businessModel: 3, team: 3, growth: 3,
          expansion: 3, regulatoryRisk: 3,
          totalScore: 0, rating: '', riskFlags: []
        },
        opportunitySummary: '',
        source: sourceId,
        sourceRef: '',
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      DATA.companies.push(company);
      calculateCompanyScore(company);
      log.push({ type: 'ok', msg: `✅ ${name} — أُضيفت (${company.sectorId}, ${company.stage})` });
      added++;
    } catch (e) {
      log.push({ type: 'err', msg: `سطر ${i + 2}: خطأ — ${e.message}` });
      skipped++;
    }
  });

  // Recalculate sector scores
  DATA.sectors.forEach(s => calculateSectorScore(s));

  log.unshift({ type: 'ok', msg: `📊 النتيجة: ${added} أُضيفت، ${skipped} تُخطيت` });
  return log;
}

/**
 * Import rounds from parsed rows
 */
function importRounds(rows, sourceId, fieldMap) {
  const log = [];
  let added = 0, skipped = 0;

  rows.forEach((row, i) => {
    try {
      const mapped = {};
      Object.entries(fieldMap).forEach(([csvField, schemaField]) => {
        if (row[csvField] !== undefined) {
          const val = transformField(schemaField, row[csvField]);
          if (val !== null) {
            if (schemaField === '_companyLookup') {
              const found = DATA.companies.find(c =>
                c.nameEn.toLowerCase() === val.toLowerCase() || c.nameAr === val
              );
              mapped.companyId = found ? found.id : null;
              mapped._companyName = val;
            } else if (schemaField === '_stageMap') mapped.type = val;
            else if (schemaField === '_parseNum') mapped.amountUSD = val;
            else if (schemaField === '_investorLookup') mapped._leadName = val;
            else mapped[schemaField] = val;
          }
        }
      });

      if (!mapped.companyId) { log.push({ type: 'warn', msg: `سطر ${i + 2}: شركة "${mapped._companyName || '?'}" غير موجودة — تم تخطيه` }); skipped++; return; }

      const round = {
        id: `${mapped.companyId}-${mapped.type || 'unknown'}-${Date.now()}`,
        companyId: mapped.companyId,
        type: mapped.type || 'seed',
        amountUSD: mapped.amountUSD || 0,
        date: mapped.date || new Date().toISOString().split('T')[0],
        investorIds: [],
        leadInvestorId: '',
        isUndisclosed: !mapped.amountUSD,
        source: sourceId
      };

      DATA.rounds.push(round);
      // Recalculate company
      const co = DATA.companies.find(c => c.id === mapped.companyId);
      if (co) calculateCompanyScore(co);

      log.push({ type: 'ok', msg: `✅ جولة ${getStageAr(round.type)} لـ ${mapped._companyName} — ${formatMoney(round.amountUSD)}` });
      added++;
    } catch (e) {
      log.push({ type: 'err', msg: `سطر ${i + 2}: خطأ — ${e.message}` });
      skipped++;
    }
  });

  DATA.sectors.forEach(s => calculateSectorScore(s));
  log.unshift({ type: 'ok', msg: `📊 النتيجة: ${added} أُضيفت، ${skipped} تُخطيت` });
  return log;
}

/**
 * Add single company manually
 */
function addCompanyManual(fields) {
  const id = (fields.nameEn || fields.nameAr || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (DATA.companies.find(c => c.id === id)) return { ok: false, msg: 'الشركة موجودة مسبقاً' };

  const company = {
    id,
    nameAr: fields.nameAr || '',
    nameEn: fields.nameEn || '',
    logo: '', sectorId: fields.sectorId || 'saas',
    stage: fields.stage || 'seed',
    foundedYear: parseInt(fields.foundedYear) || null,
    city: fields.city || '',
    website: fields.website || '',
    employeeRange: fields.employeeRange || '',
    description: fields.description || '',
    founders: fields.founders ? fields.founders.split(/[,،]/).map(s => s.trim()) : [],
    tags: [],
    scoring: {
      stage: parseInt(fields.scoreStage) || 3,
      businessModel: parseInt(fields.scoreBM) || 3,
      team: parseInt(fields.scoreTeam) || 3,
      growth: parseInt(fields.scoreGrowth) || 3,
      expansion: parseInt(fields.scoreExpansion) || 3,
      regulatoryRisk: parseInt(fields.scoreReg) || 3,
      totalScore: 0, rating: '', riskFlags: []
    },
    opportunitySummary: fields.summary || '',
    source: 'manual', sourceRef: '',
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  DATA.companies.push(company);
  calculateCompanyScore(company);
  DATA.sectors.forEach(s => calculateSectorScore(s));
  return { ok: true, msg: `✅ ${company.nameAr || company.nameEn} أُضيفت بنجاح`, company };
}

// ══════════════════════════════════════
// 7. SCORE EXPLANATION GENERATOR
// ══════════════════════════════════════

function explainCompanyScore(company) {
  const s = company.scoring;
  const parts = [];
  const sec = DATA.sectors.find(x => x.id === company.sectorId);

  // Strengths (>= 4)
  const strengths = [];
  if (s.team >= 4) strengths.push('فريق مؤسسين قوي');
  if (s.growth >= 4) strengths.push('نمو سريع');
  if (s.businessModel >= 4) strengths.push('نموذج أعمال واضح');
  if (s.investorQuality >= 4) strengths.push('مستثمرين من الدرجة الأولى');
  if (s.expansion >= 4) strengths.push('توسع إقليمي/عالمي');
  if (s.regulatoryRisk >= 4) strengths.push('بيئة تنظيمية مستقرة');
  if (s.stage >= 4) strengths.push('مرحلة متقدمة مع traction');

  // Weaknesses (<= 2)
  const weaknesses = [];
  if (s.team <= 2) weaknesses.push('فريق ضعيف');
  if (s.growth <= 2) weaknesses.push('نمو بطيء');
  if (s.businessModel <= 2) weaknesses.push('نموذج أعمال غير مثبت');
  if (s.investorQuality <= 2) weaknesses.push('لا مستثمرين مؤسسيين');
  if (s.expansion <= 2) weaknesses.push('توسع محدود');
  if (s.regulatoryRisk <= 2) weaknesses.push('مخاطر تنظيمية');

  if (strengths.length > 0) parts.push('نقاط القوة: ' + strengths.join('، '));
  if (weaknesses.length > 0) parts.push('نقاط الضعف: ' + weaknesses.join('، '));

  // Funding context
  if (s.totalFunding > 100000000) parts.push('تمويل إجمالي قوي (' + formatMoney(s.totalFunding) + ')');
  else if (s.totalFunding > 0) parts.push('تمويل: ' + formatMoney(s.totalFunding));

  // Sector context
  if (sec) parts.push('قطاع ' + sec.nameAr + ' (' + sec.scoring.totalScore + '/5 ' + getRatingEmoji(sec.scoring.rating) + ')');

  return parts.join(' | ');
}

function explainSectorScore(sector) {
  const s = sector.scoring;
  const parts = [];

  const strengths = [];
  if (s.tam >= 4) strengths.push('سوق كبير');
  if (s.growth >= 4) strengths.push('نمو سريع');
  if (s.vision2030 >= 4) strengths.push('دعم حكومي');
  if (s.competition >= 4) strengths.push('فرص مفتوحة');
  if (s.deals >= 4) strengths.push('نشاط استثماري عالي');
  if (s.funding >= 4) strengths.push('تمويل ضخم');

  const weaknesses = [];
  if (s.competition <= 2) weaknesses.push('سوق مشبع');
  if (s.growth <= 2) weaknesses.push('نمو بطيء');
  if (s.deals <= 2) weaknesses.push('صفقات قليلة');
  if (s.vision2030 <= 2) weaknesses.push('دعم حكومي محدود');

  if (strengths.length > 0) parts.push('✅ ' + strengths.join('، '));
  if (weaknesses.length > 0) parts.push('⚠️ ' + weaknesses.join('، '));

  parts.push(s.companyCount + ' شركة | ' + (s.dealCount || 0) + ' صفقة | ' + formatMoney(s.totalFunding || 0));

  return parts.join(' — ');
}

// Source badge HTML
function sourceBadge(sourceId, size) {
  const src = getSourceInfo(sourceId);
  const sz = size === 'sm' ? 'font-size:.72em;padding:2px 8px' : 'font-size:.8em;padding:3px 10px';
  return `<span style="display:inline-flex;align-items:center;gap:4px;background:${src.color}18;color:${src.color};border-radius:12px;${sz};font-weight:600">${src.icon} ${src.nameAr}</span>`;
}

// ══════════════════════════════════════
// 8. EXECUTIVE ANALYSIS ENGINE
// ══════════════════════════════════════

function getMarketGaps() {
  // Sectors with high TAM/growth but few deals
  return DATA.sectors.filter(s => {
    const sc = s.scoring;
    return (sc.tam >= 4 || sc.growth >= 4) && (sc.deals <= 2 || sc.companyCount <= 2);
  }).map(s => ({
    sector: s,
    reason: `سوق ${s.scoring.tam >= 4 ? 'كبير' : 'نامي'} (${s.scoring.companyCount} شركات فقط، ${s.scoring.dealCount || 0} صفقات) — فرصة دخول مبكر`
  }));
}

function getCrowdedSectors() {
  return DATA.sectors.filter(s => s.scoring.competition <= 2).map(s => ({
    sector: s,
    reason: `${s.scoring.companyCount} شركة تتنافس، منافسة شديدة — الدخول صعب بدون ميزة واضحة`
  }));
}

function getUndervaluedCompanies() {
  // Strong companies in overlooked sectors
  return DATA.companies.filter(c => {
    const sec = DATA.sectors.find(s => s.id === c.sectorId);
    return c.scoring.totalScore >= 3.5 && sec && sec.scoring.competition >= 4;
  }).sort((a, b) => b.scoring.totalScore - a.scoring.totalScore);
}

function getRiskyBets() {
  // High score but with red flags
  return DATA.companies.filter(c =>
    c.scoring.totalScore >= 3.0 && c.scoring.riskFlags.some(f => f.type === 'red')
  );
}

function getSectorConcentration() {
  // How concentrated is funding across sectors
  const total = getTotalFunding();
  return DATA.sectors.map(s => ({
    sector: s,
    funding: s.scoring.totalFunding || 0,
    pct: total > 0 ? ((s.scoring.totalFunding || 0) / total * 100).toFixed(1) : 0
  })).sort((a, b) => b.funding - a.funding);
}

function getSourceCoverage() {
  const coverage = {};
  DATA.sources.forEach(s => {
    const companies = DATA.companies.filter(c => c.source === s.id);
    const rounds = DATA.rounds.filter(r => r.source === s.id);
    coverage[s.id] = { source: s, companies: companies.length, rounds: rounds.length };
  });
  return coverage;
}

// ══════════════════════════════════════
// 9. AI ANALYSIS LAYER (AI-Ready)
// ══════════════════════════════════════

/**
 * AI Configuration — يتم تعبئته لاحقاً عند ربط API
 * حالياً: يولّد نصوص من القوالب المحلية
 * مستقبلاً: يرسل للنموذج اللغوي (Claude/GPT)
 */
const AI_CONFIG = {
  enabled: false,            // true عند ربط API
  provider: null,            // 'openai' | 'anthropic' | 'openrouter'
  model: null,               // 'gpt-4.1' | 'claude-sonnet-4.5'
  apiEndpoint: null,         // URL
  maxTokens: 2000,
  language: 'ar',
  temperature: 0.3           // منخفض = أكثر دقة
};

/**
 * نقاط الاستدعاء — أين يُستخدم AI في المنصة
 */
const AI_USE_CASES = {
  SECTOR_ANALYSIS:    'sector-analysis',
  COMPANY_ANALYSIS:   'company-analysis',
  INVESTMENT_MEMO:    'investment-memo',
  COMPARE_COMPANIES:  'compare-companies',
  DATA_INSIGHTS:      'data-insights',
  RISK_ASSESSMENT:    'risk-assessment'
};

/**
 * قوالب البرومبتات — مُعدّة للإرسال المباشر للنموذج
 */
const AI_PROMPTS = {

  [AI_USE_CASES.SECTOR_ANALYSIS]: (sector) => ({
    system: `أنت محلل استثمار جريء متخصص في السوق السعودي. تكتب بالعربية بأسلوب احترافي مختصر لصناع القرار. لا تستخدم مقدمات طويلة. ركّز على الأرقام والتوصيات العملية.`,
    user: `حلّل قطاع "${sector.nameAr}" (${sector.nameEn}) في السعودية كفرصة استثمار جريء.

البيانات المتاحة:
- عدد الشركات: ${sector.scoring.companyCount}
- عدد الصفقات (آخر 24 شهر): ${sector.scoring.dealCount || 0}
- إجمالي التمويل: ${formatMoney(sector.scoring.totalFunding || 0)}
- تقييم حجم السوق: ${sector.scoring.tam}/5
- تقييم النمو: ${sector.scoring.growth}/5
- كثافة المنافسة: ${sector.scoring.competition}/5 (5 = منافسة قليلة)
- توافق رؤية 2030: ${sector.scoring.vision2030}/5
- الدرجة الإجمالية: ${sector.scoring.totalScore}/5
- أبرز الشركات: ${DATA.companies.filter(c => c.sectorId === sector.id).map(c => c.nameAr).join('، ')}

اكتب تحليلاً يشمل:
1. نظرة عامة على القطاع (3 أسطر)
2. أسباب الجاذبية
3. المخاطر الرئيسية
4. الفرص غير المستغلة
5. توصية واضحة: استثمر / راقب / تجنب — مع سبب`
  }),

  [AI_USE_CASES.COMPANY_ANALYSIS]: (company) => {
    const sec = getSector(company.sectorId);
    const rounds = getCompanyRounds(company.id);
    return {
      system: `أنت محلل استثمار جريء متخصص في الشركات الناشئة السعودية. تكتب بالعربية بأسلوب احترافي. ركّز على ما يهم صانع القرار: الأرقام، المخاطر، والتوصية.`,
      user: `حلّل شركة "${company.nameAr}" (${company.nameEn}) كفرصة استثمار جريء.

معلومات الشركة:
- القطاع: ${sec?.nameAr || ''}
- المرحلة: ${getStageAr(company.stage)}
- التأسيس: ${company.foundedYear || 'غير معروف'}
- المدينة: ${company.city || ''}
- الوصف: ${company.description || ''}
- المؤسسون: ${company.founders?.join('، ') || 'غير معروف'}

تاريخ التمويل:
${rounds.map(r => `- ${getStageAr(r.type)}: ${formatMoney(r.amountUSD)} (${formatDate(r.date)})`).join('\n') || 'لا جولات مسجلة'}

التقييم الحالي:
- الفريق: ${company.scoring.team}/5
- نموذج العمل: ${company.scoring.businessModel}/5
- النمو: ${company.scoring.growth}/5
- المستثمرين: ${company.scoring.investorQuality}/5
- التوسع: ${company.scoring.expansion}/5
- التنظيمي: ${company.scoring.regulatoryRisk}/5
- الإجمالي: ${company.scoring.totalScore}/5
- المخاطر: ${company.scoring.riskFlags.map(f => f.label).join('، ') || 'لا مخاطر'}

اكتب تحليلاً يشمل:
1. ملخص الشركة (3 أسطر)
2. نقاط القوة
3. نقاط الضعف والمخاطر
4. مقارنة بالمنافسين في نفس القطاع
5. توصية: استثمر / راقب / تجنب — مع سبب`
    };
  },

  [AI_USE_CASES.INVESTMENT_MEMO]: (company) => {
    const sec = getSector(company.sectorId);
    const rounds = getCompanyRounds(company.id);
    const investors = rounds.flatMap(r => r.investorIds).map(id => getInvestor(id)).filter(Boolean);
    return {
      system: `أنت محلل استثمار جريء أول في صندوق سعودي. اكتب Investment Memo احترافي بالعربية. استخدم هيكل واضح مع عناوين. كن دقيقاً وموضوعياً.`,
      user: `اكتب Investment Memo لشركة "${company.nameAr}" (${company.nameEn}).

[نفس البيانات من company-analysis]
القطاع: ${sec?.nameAr} | المرحلة: ${getStageAr(company.stage)} | التمويل: ${formatMoney(company.scoring.totalFunding)}
المؤسسون: ${company.founders?.join('، ') || '—'}
المستثمرون الحاليون: ${investors.map(i => i.nameAr).join('، ') || '—'}
التقييم: ${company.scoring.totalScore}/5 ${getRatingEmoji(company.scoring.rating)}

الهيكل المطلوب:
1. ملخص تنفيذي (Executive Summary)
2. المشكلة والحل
3. حجم السوق (TAM/SAM/SOM)
4. نموذج الأعمال
5. المشهد التنافسي
6. الفريق
7. الأداء المالي وتاريخ التمويل
8. المخاطر الرئيسية
9. التوصية النهائية
10. الشروط المقترحة (إذا أمكن)`
    };
  },

  [AI_USE_CASES.COMPARE_COMPANIES]: (companyA, companyB) => ({
    system: `أنت محلل استثمار جريء. قارن بين شركتين بأسلوب احترافي بالعربية. ركّز على الفروقات العملية التي تؤثر على قرار الاستثمار.`,
    user: `قارن بين "${companyA.nameAr}" و "${companyB.nameAr}" كفرص استثمار جريء.

${companyA.nameAr}:
- القطاع: ${getSector(companyA.sectorId)?.nameAr} | المرحلة: ${getStageAr(companyA.stage)}
- التمويل: ${formatMoney(companyA.scoring.totalFunding)} | الدرجة: ${companyA.scoring.totalScore}/5
- القوة: فريق ${companyA.scoring.team}/5، نمو ${companyA.scoring.growth}/5، نموذج ${companyA.scoring.businessModel}/5

${companyB.nameAr}:
- القطاع: ${getSector(companyB.sectorId)?.nameAr} | المرحلة: ${getStageAr(companyB.stage)}
- التمويل: ${formatMoney(companyB.scoring.totalFunding)} | الدرجة: ${companyB.scoring.totalScore}/5
- القوة: فريق ${companyB.scoring.team}/5، نمو ${companyB.scoring.growth}/5، نموذج ${companyB.scoring.businessModel}/5

اكتب:
1. ملخص المقارنة (3 أسطر)
2. جدول مقارنة بالنقاط
3. أي شركة أفضل للاستثمار ولماذا
4. سيناريوهات: متى تختار كل واحدة`
  }),

  [AI_USE_CASES.DATA_INSIGHTS]: (newData) => ({
    system: `أنت محلل بيانات متخصص في الاستثمار الجريء. حلّل البيانات المُدخلة واستخرج insights عملية بالعربية.`,
    user: `تم إدخال بيانات جديدة في المنصة:
- عدد الشركات الجديدة: ${newData.companiesAdded || 0}
- عدد الجولات الجديدة: ${newData.roundsAdded || 0}
- المصدر: ${newData.source || 'غير محدد'}
- القطاعات المتأثرة: ${newData.sectors?.join('، ') || 'متعددة'}

إجمالي المنصة الآن: ${DATA.companies.length} شركة، ${DATA.rounds.length} جولة

استخرج:
1. أبرز 3 ملاحظات من البيانات الجديدة
2. هل تغيّر ترتيب القطاعات؟
3. هل ظهرت فرص أو مخاطر جديدة؟
4. توصيات عملية`
  }),

  [AI_USE_CASES.RISK_ASSESSMENT]: (company) => ({
    system: `أنت مستشار مخاطر استثمارية. قيّم مخاطر الشركة بدقة بالعربية. كن صريحاً وموضوعياً.`,
    user: `قيّم مخاطر الاستثمار في "${company.nameAr}" (${company.nameEn}).

المخاطر المكتشفة تلقائياً: ${company.scoring.riskFlags.map(f => f.label).join('، ') || 'لا مخاطر'}
القطاع: ${getSector(company.sectorId)?.nameAr} | المرحلة: ${getStageAr(company.stage)}
التقييم: ${company.scoring.totalScore}/5

قيّم كل نوع من المخاطر (1-5):
1. مخاطر السوق (حجم، منافسة، timing)
2. مخاطر التنفيذ (فريق، تقنية، تشغيل)
3. مخاطر تنظيمية (تراخيص، قوانين)
4. مخاطر مالية (حرق، runway، unit economics)
5. مخاطر التوسع (scalability، أسواق جديدة)

ثم اكتب:
- المخاطر القاتلة (إن وُجدت)
- خطة التخفيف المقترحة
- التقييم النهائي: مقبول / يحتاج حذر / مرتفع جداً`
  })
};

/**
 * AI Request Handler — نقطة الاتصال الوحيدة
 * حالياً: يرجع placeholder
 * مستقبلاً: يرسل للـ API ويرجع النتيجة
 */
async function requestAI(useCase, ...args) {
  const promptBuilder = AI_PROMPTS[useCase];
  if (!promptBuilder) return { ok: false, text: 'نوع تحليل غير معروف' };

  const prompt = promptBuilder(...args);

  // ── إذا AI مفعّل → أرسل للـ API ──
  if (AI_CONFIG.enabled && AI_CONFIG.apiEndpoint) {
    try {
      const resp = await fetch(AI_CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user }
          ],
          max_tokens: AI_CONFIG.maxTokens,
          temperature: AI_CONFIG.temperature
        })
      });
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content || data.content?.[0]?.text || '';
      return { ok: true, text, source: 'ai', model: AI_CONFIG.model };
    } catch (e) {
      return { ok: false, text: 'خطأ في الاتصال بالنموذج: ' + e.message, source: 'error' };
    }
  }

  // ── AI غير مفعّل → نص محلي من التحليل الآلي ──
  return generateLocalAnalysis(useCase, ...args);
}

/**
 * تحليل محلي — بديل عن AI حتى يتم الربط
 */
function generateLocalAnalysis(useCase, ...args) {
  switch (useCase) {
    case AI_USE_CASES.SECTOR_ANALYSIS: {
      const s = args[0];
      const sc = s.scoring;
      const companies = DATA.companies.filter(c => c.sectorId === s.id);
      let text = `## تحليل قطاع ${s.nameAr}\n\n`;
      text += `قطاع ${s.nameAr} حصل على تقييم **${sc.totalScore}/5** (${getRatingAr(sc.rating)}).\n\n`;
      text += `### الأرقام\n`;
      text += `- ${sc.companyCount} شركة ناشئة | ${sc.dealCount || 0} صفقة في آخر سنتين | ${formatMoney(sc.totalFunding || 0)} إجمالي تمويل\n\n`;
      text += `### نقاط القوة\n`;
      if (sc.tam >= 4) text += `- سوق كبير (${sc.tam}/5)\n`;
      if (sc.growth >= 4) text += `- نمو سريع (${sc.growth}/5)\n`;
      if (sc.vision2030 >= 4) text += `- دعم حكومي ورؤية 2030 (${sc.vision2030}/5)\n`;
      if (sc.competition >= 4) text += `- فرص مفتوحة — منافسة محدودة (${sc.competition}/5)\n`;
      text += `\n### المخاطر\n`;
      sc.riskFlags.forEach(f => { text += `- ⚠️ ${f.label}\n`; });
      if (sc.riskFlags.length === 0) text += `- لا مخاطر رئيسية مكتشفة\n`;
      text += `\n### أبرز الشركات\n`;
      companies.sort((a, b) => b.scoring.totalScore - a.scoring.totalScore).slice(0, 5).forEach(c => {
        text += `- ${c.nameAr} (${c.scoring.totalScore} ${getRatingEmoji(c.scoring.rating)})\n`;
      });
      text += `\n### التوصية\n`;
      text += sc.totalScore >= 4 ? '**استثمر** — قطاع جاذب بمؤشرات قوية' :
              sc.totalScore >= 3 ? '**راقب** — قطاع واعد لكن يحتاج متابعة' :
              '**تجنب** — مخاطر تفوق الفرص حالياً';
      return { ok: true, text, source: 'local' };
    }

    case AI_USE_CASES.COMPANY_ANALYSIS: {
      const c = args[0];
      const sec = getSector(c.sectorId);
      let text = `## تحليل ${c.nameAr} (${c.nameEn})\n\n`;
      text += `${c.description || ''}\n\n`;
      text += `**القطاع:** ${sec?.nameAr || ''} | **المرحلة:** ${getStageAr(c.stage)} | **التمويل:** ${formatMoney(c.scoring.totalFunding)} | **الدرجة:** ${c.scoring.totalScore}/5 ${getRatingEmoji(c.scoring.rating)}\n\n`;
      text += `### نقاط القوة\n`;
      if (c.scoring.team >= 4) text += `- فريق قوي (${c.scoring.team}/5)\n`;
      if (c.scoring.growth >= 4) text += `- نمو سريع (${c.scoring.growth}/5)\n`;
      if (c.scoring.businessModel >= 4) text += `- نموذج أعمال واضح (${c.scoring.businessModel}/5)\n`;
      if (c.scoring.investorQuality >= 4) text += `- مستثمرين من الدرجة الأولى (${c.scoring.investorQuality}/5)\n`;
      if (c.scoring.expansion >= 4) text += `- توسع إقليمي/عالمي (${c.scoring.expansion}/5)\n`;
      text += `\n### المخاطر\n`;
      c.scoring.riskFlags.forEach(f => { text += `- ${f.icon} ${f.label}\n`; });
      if (c.scoring.riskFlags.length === 0) text += `- لا مخاطر رئيسية ✅\n`;
      if (c.opportunitySummary) text += `\n### لماذا فرصة جيدة\n${c.opportunitySummary}\n`;
      text += `\n### التوصية\n`;
      text += c.scoring.totalScore >= 4 ? '**استثمر** — شركة قوية بمؤشرات ممتازة' :
              c.scoring.totalScore >= 3 ? '**راقب** — واعدة لكن تحتاج متابعة' :
              '**تجنب** — مخاطر عالية';
      return { ok: true, text, source: 'local' };
    }

    case AI_USE_CASES.INVESTMENT_MEMO: {
      const c = args[0];
      let text = `# Investment Memo — ${c.nameAr}\n\n`;
      text += `⚠️ **هذا ملخص أولي مولّد من البيانات المتاحة. للحصول على Investment Memo احترافي مفصّل، فعّل تكامل AI.**\n\n`;
      text += generateLocalAnalysis(AI_USE_CASES.COMPANY_ANALYSIS, c).text;
      text += `\n\n---\n*لتفعيل التحليل المتقدم بالذكاء الاصطناعي، اذهب لإعدادات AI.*`;
      return { ok: true, text, source: 'local' };
    }

    default:
      return { ok: true, text: '⚠️ هذا التحليل يحتاج تفعيل تكامل AI للحصول على نتائج متقدمة.', source: 'local' };
  }
}

/**
 * عرض نتيجة AI في Modal
 */
function showAIResult(title, text, source) {
  const badge = source === 'ai' ?
    `<span style="background:var(--accent);color:#fff;padding:2px 10px;border-radius:12px;font-size:.75em">🤖 AI — ${AI_CONFIG.model}</span>` :
    `<span style="background:var(--bg4);color:var(--text3);padding:2px 10px;border-radius:12px;font-size:.75em">📊 تحليل آلي (محلي)</span>`;

  // Simple markdown-like rendering
  const html = text
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.2em;margin:16px 0 8px;color:var(--accent2)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.4em;margin:16px 0 10px;color:var(--text)">$1</h1>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:1em;margin:14px 0 6px;color:var(--text)">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/^- (.+)$/gm, '<div style="padding:2px 0 2px 16px;font-size:.9em">• $1</div>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');

  document.getElementById('modal-content').innerHTML = `
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="font-size:1.2em">${title}</h2>
      ${badge}
    </div>
    <div style="color:var(--text2);line-height:1.8;font-size:.92em">${html}</div>
    ${source === 'local' ? `<div style="margin-top:18px;padding:12px;background:var(--bg3);border-radius:var(--radius2);font-size:.82em;color:var(--text3)">💡 هذا تحليل أولي من البيانات. لتحليل أعمق بالذكاء الاصطناعي، فعّل AI من الإعدادات.</div>` : ''}
  `;
  document.getElementById('modal-overlay').classList.add('show');
}

// Score bar HTML
function scoreBar(score, max = 5) {
  const pct = (score / max) * 100;
  const rating = getScoreRating(score);
  const color = getRatingColor(rating);
  return `<div class="score-bar"><div class="score-fill" style="width:${pct}%;background:${color}"></div></div>`;
}
