// =============================================================================
// DOCUMENTATION SERVICE
// Manage live, updateable documentation for admin and client users
// =============================================================================

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export interface DocumentationData {
  id: string;
  slug: string;
  title: string;
  category: string;
  audience: "admin" | "client" | "both";
  content: string;
  excerpt?: string;
  order: number;
  isPublished: boolean;
  version: string;
  tags?: string[];
  keywords?: string[];
  viewCount: number;
  lastViewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDocumentationInput {
  slug: string;
  title: string;
  category: string;
  audience: "admin" | "client" | "both";
  content: string;
  excerpt?: string;
  order?: number;
  tags?: string[];
  keywords?: string[];
}

export interface UpdateDocumentationInput {
  title?: string;
  category?: string;
  audience?: "admin" | "client" | "both";
  content?: string;
  excerpt?: string;
  order?: number;
  isPublished?: boolean;
  tags?: string[];
  keywords?: string[];
  version?: string;
  changeNotes?: string;
}

export interface DocumentationListQuery {
  audience?: "admin" | "client" | "both";
  category?: string;
  search?: string;
  publishedOnly?: boolean;
}

// =============================================================================
// DOCUMENTATION SERVICE
// =============================================================================

export class DocumentationService {
  /**
   * Get all documentation matching query
   */
  static async getDocumentation(
    query: DocumentationListQuery = {},
  ): Promise<DocumentationData[]> {
    const { audience, category, search, publishedOnly = true } = query;

    const where: any = {};

    if (publishedOnly) {
      where.isPublished = true;
    }

    if (audience) {
      where.OR = [{ audience }, { audience: "both" }];
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { excerpt: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const docs = await prisma.documentation.findMany({
      where,
      orderBy: [{ category: "asc" }, { order: "asc" }, { title: "asc" }],
    });

    return docs as unknown as DocumentationData[];
  }

  /**
   * Get documentation by slug
   */
  static async getDocumentationBySlug(
    slug: string,
  ): Promise<DocumentationData | null> {
    const doc = await prisma.documentation.findUnique({
      where: { slug },
    });

    if (doc) {
      // Increment view count
      await prisma.documentation.update({
        where: { slug },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      });
    }

    return doc as DocumentationData | null;
  }

  /**
   * Get documentation by ID
   */
  static async getDocumentationById(
    id: string,
  ): Promise<DocumentationData | null> {
    const doc = await prisma.documentation.findUnique({
      where: { id },
    });

    return doc as DocumentationData | null;
  }

  /**
   * Create new documentation
   */
  static async createDocumentation(
    input: CreateDocumentationInput,
    createdBy: string,
  ): Promise<DocumentationData> {
    const doc = await prisma.documentation.create({
      data: {
        slug: input.slug,
        title: input.title,
        category: input.category,
        audience: input.audience,
        content: input.content,
        excerpt: input.excerpt,
        order: input.order || 0,
        tags: (input.tags as any) || null,
        keywords: (input.keywords as any) || null,
        lastUpdatedBy: createdBy,
        changeLog: [
          {
            version: "1.0.0",
            date: new Date().toISOString(),
            changes: "Initial creation",
            updatedBy: createdBy,
          },
        ] as any,
      },
    });

    logger.info("Created documentation", {
      id: doc.id,
      slug: doc.slug,
      createdBy,
    });

    return doc as unknown as DocumentationData;
  }

  /**
   * Update existing documentation
   */
  static async updateDocumentation(
    id: string,
    updates: UpdateDocumentationInput,
    updatedBy: string,
  ): Promise<DocumentationData> {
    const existing = await prisma.documentation.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Documentation not found");
    }

    // Prepare update data
    const updateData: any = { ...updates };

    if (updates.tags) {
      updateData.tags = updates.tags as any;
    }

    if (updates.keywords) {
      updateData.keywords = updates.keywords as any;
    }

    updateData.lastUpdatedBy = updatedBy;

    // Add to change log
    const changeLog = (existing.changeLog as any) || [];
    changeLog.push({
      version: updates.version || existing.version,
      date: new Date().toISOString(),
      changes: updates.changeNotes || "Content updated",
      updatedBy,
    });
    updateData.changeLog = changeLog as any;

    const doc = await prisma.documentation.update({
      where: { id },
      data: updateData,
    });

    logger.info("Updated documentation", {
      id: doc.id,
      slug: doc.slug,
      updatedBy,
    });

    return doc as unknown as DocumentationData;
  }

  /**
   * Delete documentation
   */
  static async deleteDocumentation(id: string): Promise<void> {
    await prisma.documentation.delete({
      where: { id },
    });

    logger.info("Deleted documentation", { id });
  }

  /**
   * Get categories list
   */
  static async getCategories(
    audience?: "admin" | "client" | "both",
  ): Promise<string[]> {
    const where: any = { isPublished: true };

    if (audience) {
      where.OR = [{ audience }, { audience: "both" }];
    }

    const docs = await prisma.documentation.findMany({
      where,
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });

    return docs.map((d) => d.category);
  }

  /**
   * Search documentation
   */
  static async searchDocumentation(
    searchTerm: string,
    audience?: "admin" | "client" | "both",
  ): Promise<DocumentationData[]> {
    const where: any = {
      isPublished: true,
      OR: [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { excerpt: { contains: searchTerm, mode: "insensitive" } },
        { content: { contains: searchTerm, mode: "insensitive" } },
      ],
    };

    if (audience) {
      where.AND = [{ OR: [{ audience }, { audience: "both" }] }];
    }

    const docs = await prisma.documentation.findMany({
      where,
      orderBy: { viewCount: "desc" },
      take: 20,
    });

    return docs as unknown as DocumentationData[];
  }

  /**
   * Import documentation from markdown file
   */
  static async importFromMarkdown(
    filePath: string,
    metadata: {
      slug: string;
      title: string;
      category: string;
      audience: "admin" | "client" | "both";
      excerpt?: string;
      tags?: string[];
    },
    createdBy: string,
  ): Promise<DocumentationData> {
    const fs = await import("fs/promises");
    const content = await fs.readFile(filePath, "utf-8");

    return this.createDocumentation(
      {
        ...metadata,
        content,
      },
      createdBy,
    );
  }
}
