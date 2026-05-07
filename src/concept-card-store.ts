/**
 * ConceptCardStore - Manages concept card library.
 * Each category has its own independent folder namespace.
 */
import { App, TFile, TFolder } from 'obsidian';

export interface ConceptCard {
  id: string;
  title: string;
  keywords: string[];
  category: string[];
  folderByCategory: Record<string, string>; // { "Evidence": "Benchmarks", "Quote": "Interviews" }
  content: string;
  source: string;
  sourceLine: number;
  notes: string;
  createdAt: string;
}

export interface CardLibrary {
  version: number;
  lastUpdated: string;
  cards: ConceptCard[];
  categoryFolders: Record<string, string[]>; // { "Evidence": ["Benchmarks", "Reports"], ... }
}

export class ConceptCardStore {
  private app: App;
  private basePath: string;
  private cache: CardLibrary | null = null;

  constructor(app: App, basePath: string) {
    this.app = app;
    this.basePath = basePath;
  }

  setBasePath(basePath: string) {
    this.basePath = basePath;
    this.cache = null;
  }

  private get jsonPath(): string { return `${this.basePath}/_library.json`; }
  private get mdPath(): string { return `${this.basePath}/_library.md`; }

  // ---- Card CRUD ----

  async getCards(): Promise<ConceptCard[]> {
    return (await this.load()).cards;
  }

  async addCard(card: ConceptCard): Promise<void> {
    const lib = await this.load();
    lib.cards.push(card);
    lib.lastUpdated = new Date().toISOString();
    await this.save(lib);
    await this.generateMarkdown(lib);
  }

  async updateCard(cardId: string, updates: Partial<Omit<ConceptCard, 'id'>>): Promise<void> {
    const lib = await this.load();
    const card = lib.cards.find(c => c.id === cardId);
    if (!card) return;
    Object.assign(card, updates);
    lib.lastUpdated = new Date().toISOString();
    await this.save(lib);
    await this.generateMarkdown(lib);
  }

  async removeCard(cardId: string): Promise<void> {
    const lib = await this.load();
    lib.cards = lib.cards.filter(c => c.id !== cardId);
    lib.lastUpdated = new Date().toISOString();
    await this.save(lib);
    await this.generateMarkdown(lib);
  }

  async searchCards(query: string): Promise<ConceptCard[]> {
    const cards = await this.getCards();
    if (!query.trim()) return cards;
    const q = query.toLowerCase();
    return cards.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.keywords.some(k => k.toLowerCase().includes(q)) ||
      (Array.isArray(c.category) && c.category.some(cat => cat.toLowerCase().includes(q))) ||
      c.content.toLowerCase().includes(q) ||
      c.notes.toLowerCase().includes(q)
    );
  }

  async moveCardToFolder(cardId: string, category: string, folderPath: string): Promise<void> {
    const lib = await this.load();
    const card = lib.cards.find(c => c.id === cardId);
    if (!card) return;
    if (!card.folderByCategory) card.folderByCategory = {};
    if (folderPath) {
      card.folderByCategory[category] = folderPath;
    } else {
      delete card.folderByCategory[category];
    }
    lib.lastUpdated = new Date().toISOString();
    await this.save(lib);
    await this.generateMarkdown(lib);
  }

  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  // ---- Category-scoped Folder CRUD ----

  async getFolders(category: string): Promise<string[]> {
    const lib = await this.load();
    return (lib.categoryFolders && lib.categoryFolders[category]) || [];
  }

  async createFolder(category: string, path: string): Promise<void> {
    const lib = await this.load();
    if (!lib.categoryFolders) lib.categoryFolders = {};
    if (!lib.categoryFolders[category]) lib.categoryFolders[category] = [];
    if (!lib.categoryFolders[category].includes(path)) {
      lib.categoryFolders[category].push(path);
      lib.categoryFolders[category].sort();
      lib.lastUpdated = new Date().toISOString();
      await this.save(lib);
      await this.generateMarkdown(lib);
    }
  }

  async renameFolder(category: string, oldPath: string, newPath: string): Promise<void> {
    const lib = await this.load();
    if (!lib.categoryFolders || !lib.categoryFolders[category]) return;

    lib.categoryFolders[category] = lib.categoryFolders[category].map(f => {
      if (f === oldPath) return newPath;
      if (f.startsWith(oldPath + '/')) return newPath + f.slice(oldPath.length);
      return f;
    });

    for (const card of lib.cards) {
      if (!card.folderByCategory) continue;
      const val = card.folderByCategory[category];
      if (val === oldPath) {
        card.folderByCategory[category] = newPath;
      } else if (val && val.startsWith(oldPath + '/')) {
        card.folderByCategory[category] = newPath + val.slice(oldPath.length);
      }
    }

    lib.categoryFolders[category].sort();
    lib.lastUpdated = new Date().toISOString();
    await this.save(lib);
    await this.generateMarkdown(lib);
  }

  async deleteFolder(category: string, path: string): Promise<void> {
    const lib = await this.load();
    if (!lib.categoryFolders || !lib.categoryFolders[category]) return;

    const hasCards = lib.cards.some(c => {
      const f = c.folderByCategory && c.folderByCategory[category];
      return f === path || (f && f.startsWith(path + '/'));
    });
    const hasSubFolders = lib.categoryFolders[category].some(
      f => f !== path && f.startsWith(path + '/')
    );
    if (hasCards || hasSubFolders) return;

    lib.categoryFolders[category] = lib.categoryFolders[category].filter(f => f !== path);
    lib.lastUpdated = new Date().toISOString();
    await this.save(lib);
    await this.generateMarkdown(lib);
  }

  // ---- Migration ----

  private migrateCards(lib: CardLibrary): void {
    let dirty = false;

    // Migrate old lib.folders -> lib.categoryFolders
    if ((lib as any).folders && !lib.categoryFolders) {
      lib.categoryFolders = {};
      dirty = true;
    }
    delete (lib as any).folders;
    if (!lib.categoryFolders) { lib.categoryFolders = {}; dirty = true; }

    for (const card of lib.cards) {
      // category: string -> string[]
      if (typeof card.category === 'string') {
        card.category = (card.category as string).trim() ? [card.category as string] : [];
        dirty = true;
      }
      if (!card.category) { card.category = []; dirty = true; }

      // old folder: string -> folderByCategory: {}
      if ((card as any).folder !== undefined) {
        delete (card as any).folder;
        dirty = true;
      }
      if (!card.folderByCategory) {
        card.folderByCategory = {};
        dirty = true;
      }
    }
    if (dirty) this.save(lib);
  }

  // ---- Persistence ----

  private async ensureFolder(): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(this.basePath)) {
      await this.app.vault.createFolder(this.basePath);
    }
  }

  private async load(): Promise<CardLibrary> {
    if (this.cache) return this.cache;
    const file = this.app.vault.getAbstractFileByPath(this.jsonPath);
    if (file && file instanceof TFile) {
      try {
        const content = await this.app.vault.read(file);
        const lib = JSON.parse(content) as CardLibrary;
        this.migrateCards(lib);
        this.cache = lib;
        return this.cache;
      } catch { /* start fresh */ }
    }
    const empty: CardLibrary = { version: 1, lastUpdated: new Date().toISOString(), cards: [], categoryFolders: {} };
    this.cache = empty;
    return empty;
  }

  private async save(lib: CardLibrary): Promise<void> {
    await this.ensureFolder();
    this.cache = lib;
    const content = JSON.stringify(lib, null, 2);
    const file = this.app.vault.getAbstractFileByPath(this.jsonPath);
    if (file && file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      await this.app.vault.create(this.jsonPath, content);
    }
  }

  // ---- Markdown Generation (category → folder hierarchy) ----

  private async generateMarkdown(lib: CardLibrary): Promise<void> {
    await this.generateRootMarkdown(lib);
    await this.generateCategoryFolderMarkdowns(lib);
  }

  private async generateRootMarkdown(lib: CardLibrary): Promise<void> {
    const date = new Date(lib.lastUpdated).toLocaleDateString();
    const lines: string[] = [];
    lines.push('# Knowledge Card Library');
    lines.push('');
    lines.push(`> ${lib.cards.length} card${lib.cards.length === 1 ? '' : 's'} | Last updated: ${date}`);
    lines.push('>');
    lines.push('> **AI retrieval hint**: Search this file by keyword, title, source, or quoted content.');
    lines.push('> Cards are curated excerpts saved from Obsidian notes for reuse in writing and review workflows.');
    lines.push('');
    for (const card of lib.cards) this.appendCardMarkdown(lines, card);
    if (lib.cards.length > 0) lines.push('---');
    await this.writeMarkdownFile(this.mdPath, lines.join('\n'));
  }

  private async generateCategoryFolderMarkdowns(lib: CardLibrary): Promise<void> {
    // Group cards by category
    const byCat = new Map<string, ConceptCard[]>();
    for (const card of lib.cards) {
      const cats = Array.isArray(card.category) && card.category.length > 0
        ? card.category : ['Uncategorized'];
      for (const cat of cats) {
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat)!.push(card);
      }
    }

    // Also ensure categories with folders but no cards get a directory
    for (const cat of Object.keys(lib.categoryFolders || {})) {
      if (!byCat.has(cat)) byCat.set(cat, []);
    }

    for (const [catName, catCards] of byCat) {
      const catDir = `${this.basePath}/${catName}`;
      await this.ensureDir(catDir);

      // Category-level _cards.md
      const date = new Date(lib.lastUpdated).toLocaleDateString();
      const catLines: string[] = [];
      catLines.push(`# ${catName}`);
      catLines.push('');
      catLines.push(`> ${catCards.length} card${catCards.length === 1 ? '' : 's'} | Last updated: ${date}`);
      catLines.push('');
      for (const card of catCards) this.appendCardMarkdown(catLines, card);
      if (catCards.length > 0) catLines.push('---');
      await this.writeMarkdownFile(`${catDir}/_cards.md`, catLines.join('\n'));

      // Per-folder _cards.md within this category
      const folders = (lib.categoryFolders && lib.categoryFolders[catName]) || [];
      const byFolder = new Map<string, ConceptCard[]>();
      for (const card of catCards) {
        const f = (card.folderByCategory && card.folderByCategory[catName]) || '';
        if (f) {
          if (!byFolder.has(f)) byFolder.set(f, []);
          byFolder.get(f)!.push(card);
        }
      }

      for (const fp of folders) {
        const folderDir = `${catDir}/${fp}`;
        await this.ensureDir(folderDir);
        const folderCards = byFolder.get(fp) || [];
        const fLines: string[] = [];
        const displayName = fp.split('/').pop() || fp;
        fLines.push(`# ${displayName}`);
        fLines.push('');
        fLines.push(`> Category: ${catName} | ${folderCards.length} card${folderCards.length === 1 ? '' : 's'} | Last updated: ${date}`);
        fLines.push('');
        for (const card of folderCards) this.appendCardMarkdown(fLines, card);
        if (folderCards.length > 0) fLines.push('---');
        await this.writeMarkdownFile(`${folderDir}/_cards.md`, fLines.join('\n'));
      }
    }
  }

  private appendCardMarkdown(lines: string[], card: ConceptCard): void {
    lines.push('---');
    lines.push('');
    lines.push(`### ${card.title}`);
    const cats = Array.isArray(card.category) ? card.category : [];
    if (cats.length > 0) lines.push(`**Categories**: ${cats.join(', ')}`);
    lines.push(`**Keywords**: ${card.keywords.join(', ')}`);
    const fileName = card.source.split('/').pop() || card.source;
    lines.push(`**Source**: ${fileName} · line ${card.sourceLine}`);
    if (card.notes) lines.push(`**Notes**: ${card.notes}`);
    lines.push('');
    for (const cl of card.content.split('\n')) lines.push(`> ${cl}`);
    lines.push('');
  }

  private async ensureDir(dirPath: string): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(dirPath)) {
      try { await this.app.vault.createFolder(dirPath); } catch { /* already exists */ }
    }
  }

  private async writeMarkdownFile(filePath: string, content: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file && file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      // Ensure parent directories exist
      const parts = filePath.split('/');
      for (let i = 1; i < parts.length - 1; i++) {
        const dirPath = parts.slice(0, i + 1).join('/');
        await this.ensureDir(dirPath);
      }
      await this.app.vault.create(filePath, content);
    }
  }
}
