/**
 * Rule-based keyword extraction for Chinese/English mixed text.
 * Extracts English proper nouns, technical terms, and Chinese semantic phrases.
 */

const CHINESE_STOPWORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '我们', '你们',
  '他们', '那', '那个', '这个', '什么', '怎么', '如何', '为什么',
  '可以', '能', '能够', '应该', '需要', '已经', '正在', '将', '将会',
  '但', '但是', '而', '而且', '以及', '或', '或者', '因为', '所以',
  '如果', '虽然', '虽', '等', '为', '对', '从', '向', '与', '及',
  '被', '把', '让', '给', '用', '以', '按', '比', '更', '最',
  '其', '其中', '之', '之一', '之间', '通过', '进行', '实现', '提供',
  '包括', '以下', '以上', '目前', '现在', '当前', '同时', '而是',
  '不是', '只是', '还是', '并且', '然而', '因此', '这些', '那些',
  '这样', '那样', '这种', '那种', '来', '去', '过', '着',
  '呢', '吧', '啊', '哦', '嗯', '么', '吗', '呀',
  '一些', '一种', '一样', '一直', '一定', '每', '各',
  '第一', '第二', '第三', '第四', '第五',
  '方面', '问题', '情况', '方式', '过程', '部分', '内容', '工作',
  '发展', '建设', '研究', '分析', '报告', '指出', '表示', '认为',
]);

const ENGLISH_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'must', 'need',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'or', 'but', 'not', 'no', 'nor', 'if', 'then', 'else',
  'than', 'too', 'very', 'just', 'about', 'also', 'so', 'such',
  'that', 'this', 'these', 'those', 'it', 'its', 'they', 'them',
  'he', 'she', 'we', 'you', 'i', 'me', 'my', 'your', 'his', 'her',
  'our', 'their', 'who', 'which', 'what', 'when', 'where', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some',
  'any', 'other', 'only', 'own', 'same', 'new', 'old', 'first',
]);

// Functional words used to split long clauses into sub-phrases
const SPLIT_WORDS = /的|等|和|与|或|及|把|被|将|在|对|从|向|到|让|给|用|按|为|以/g;

/**
 * Extract keywords from mixed Chinese/English text.
 * Returns up to 4 high-quality keyword strings.
 */
export function extractKeywords(text: string): string[] {
  const keywords: Map<string, number> = new Map();

  extractEnglishTerms(text, keywords);
  extractChinesePhrases(text, keywords);
  extractNumberPhrases(text, keywords);

  const sorted = [...keywords.entries()]
    .filter(([, score]) => score >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([kw]) => kw);

  return sorted.slice(0, 4);
}

function extractEnglishTerms(text: string, keywords: Map<string, number>) {
  const englishPattern = /[A-Za-z][A-Za-z0-9._-]*(?:\s+[A-Z][A-Za-z0-9._-]*)*/g;
  let match;
  while ((match = englishPattern.exec(text)) !== null) {
    const term = match[0].trim();
    if (term.length <= 2) continue;
    const lower = term.toLowerCase();
    if (ENGLISH_STOPWORDS.has(lower)) continue;

    let score = 1;
    if (/^[A-Z]/.test(term)) score += 2;
    if (/^[A-Z]{2,}/.test(term)) score += 3;
    if (/\d/.test(term)) score += 1;
    if (term.includes('.') || term.includes('-')) score += 1;

    const existing = keywords.get(term) || 0;
    keywords.set(term, existing + score);
  }
}

/**
 * Extract Chinese key phrases by splitting text into clauses at punctuation,
 * then further splitting long clauses by functional words to get semantic sub-phrases.
 */
function extractChinesePhrases(text: string, keywords: Map<string, number>) {
  // Step 1: Split into clauses at punctuation
  const clauses = text.split(/[，。；！？、：""''（）【】\[\]{}《》\s\n\r\t,.:;!?()]+/);

  for (const clause of clauses) {
    if (!clause) continue;

    // Strip English/numbers to get the Chinese parts for analysis
    const chineseOnly = clause.replace(/[A-Za-z0-9._\-\s%]+/g, '');
    if (chineseOnly.length < 3) continue;

    // Step 2: If the clause is short enough (3-12 chars of Chinese), use it directly
    if (chineseOnly.length >= 3 && chineseOnly.length <= 12) {
      const cleaned = trimFunctionalPrefixSuffix(chineseOnly);
      if (cleaned.length >= 3) {
        addChineseCandidate(cleaned, keywords);
      }
    }

    // Step 3: For longer clauses, split by functional words
    if (chineseOnly.length > 6) {
      const subPhrases = chineseOnly.split(SPLIT_WORDS);
      for (const sp of subPhrases) {
        const trimmed = sp.trim();
        if (trimmed.length < 3 || trimmed.length > 12) continue;
        addChineseCandidate(trimmed, keywords);
      }
    }
  }
}

function addChineseCandidate(phrase: string, keywords: Map<string, number>) {
  if (CHINESE_STOPWORDS.has(phrase)) return;
  // Pure Chinese check — must be mostly Chinese characters
  const chineseChars = phrase.match(/[\u4e00-\u9fff]/g);
  if (!chineseChars || chineseChars.length < 2) return;

  let score = 2;
  if (phrase.length >= 4) score += 1;
  if (phrase.length >= 6) score += 1;
  // Boost domain-specific terms
  if (/[智能模型算法数据技术产业人才芯片成本费用视频图像生成替代]/.test(phrase)) score += 1;

  const existing = keywords.get(phrase) || 0;
  keywords.set(phrase, existing + score);
}

/** Strip common leading/trailing functional characters that don't carry meaning alone */
function trimFunctionalPrefixSuffix(phrase: string): string {
  return phrase
    .replace(/^[在被将把从向对到以用按为让给了是有]/, '')
    .replace(/[了的等着过]$/, '');
}

function extractNumberPhrases(text: string, keywords: Map<string, number>) {
  const numPattern = /\d+[.\d]*[%TBMKk万亿]?\s*(?:tokens?|美元|元|人民币|倍|款|个|家|人|万|亿|年|月|天|小时)?/g;
  let match;
  while ((match = numPattern.exec(text)) !== null) {
    const term = match[0].trim();
    if (term.length < 2) continue;
    if (/^\d+$/.test(term)) continue;

    const existing = keywords.get(term) || 0;
    keywords.set(term, existing + 1);
  }
}
