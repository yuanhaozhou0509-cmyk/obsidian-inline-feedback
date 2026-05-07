import { App, TFile } from 'obsidian';

export interface Annotation {
  id: string;
  originalText: string;
  feedback: string;
  lineStart: number;
  lineEnd: number;
  charStart: number;
  charEnd: number;
  timestamp: string;
}

export interface FeedbackData {
  source: string;
  annotations: Annotation[];
}

export class AnnotationStore {
  private app: App;
  private cache: Map<string, FeedbackData> = new Map();

  constructor(app: App) {
    this.app = app;
  }

  private getFeedbackPath(filePath: string): string {
    return filePath.replace(/\.md$/, '.feedback.json');
  }

  async load(filePath: string): Promise<FeedbackData> {
    const cached = this.cache.get(filePath);
    if (cached) {
      return cached;
    }

    const feedbackPath = this.getFeedbackPath(filePath);
    const file = this.app.vault.getAbstractFileByPath(feedbackPath);

    if (file && file instanceof TFile) {
      try {
        const content = await this.app.vault.read(file);
        const data = JSON.parse(content) as FeedbackData;
        this.cache.set(filePath, data);
        return data;
      } catch {
        // If JSON parsing fails, start fresh
        const emptyData: FeedbackData = { source: filePath, annotations: [] };
        this.cache.set(filePath, emptyData);
        return emptyData;
      }
    }

    const emptyData: FeedbackData = { source: filePath, annotations: [] };
    this.cache.set(filePath, emptyData);
    return emptyData;
  }

  async save(filePath: string): Promise<void> {
    const data = this.cache.get(filePath);
    if (!data) return;

    const feedbackPath = this.getFeedbackPath(filePath);
    const content = JSON.stringify(data, null, 2);
    const file = this.app.vault.getAbstractFileByPath(feedbackPath);

    try {
      if (file && file instanceof TFile) {
        await this.app.vault.modify(file, content);
      } else {
        await this.app.vault.create(feedbackPath, content);
      }
    } catch (err: any) {
      throw err;
    }
  }

  async addAnnotation(filePath: string, annotation: Annotation): Promise<void> {
    const data = await this.load(filePath);
    data.annotations.push(annotation);
    await this.save(filePath);
  }

  async removeAnnotation(filePath: string, annotationId: string): Promise<void> {
    const data = await this.load(filePath);
    data.annotations = data.annotations.filter(a => a.id !== annotationId);
    await this.save(filePath);
  }

  async updateAnnotation(filePath: string, annotationId: string, newFeedback: string): Promise<void> {
    const data = await this.load(filePath);
    const ann = data.annotations.find(a => a.id === annotationId);
    if (ann) {
      ann.feedback = newFeedback;
      ann.timestamp = new Date().toISOString();
      await this.save(filePath);
    }
  }

  async getAnnotations(filePath: string): Promise<Annotation[]> {
    const data = await this.load(filePath);
    return data.annotations;
  }

  async clearAnnotations(filePath: string): Promise<void> {
    const data = await this.load(filePath);
    data.annotations = [];
    await this.save(filePath);
  }

  clearCache(filePath?: string): void {
    if (filePath) {
      this.cache.delete(filePath);
    } else {
      this.cache.clear();
    }
  }

  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
}
