# Documentation System Setup

## Overview

The documentation system provides live, updateable user guides for both admin and client users. Documentation is stored in the database and can be updated through the admin interface without redeploying the application.

## Installation

### 1. Install Dependencies

**Portal:**

```bash
cd apps/portal
npm install react-markdown remark-gfm
```

**Web (Admin Dashboard):**

```bash
cd apps/web
npm install react-markdown remark-gfm
```

### 2. Run Database Migration

```bash
cd apps/api
npx prisma migrate dev --name add_documentation_system
npx prisma generate
```

### 3. Seed Initial Documentation

The agents have created comprehensive user guides at:

- `/apps/web/public/docs/admin-user-guide.md` - Admin documentation
- `/apps/portal/public/docs/client-user-guide.md` - Client documentation

Import these into the database:

```bash
cd apps/api
npm run seed:documentation
```

Or manually via API (requires admin token):

```bash
# Admin guide
curl -X POST http://localhost:3001/api/documentation \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "admin-user-guide",
    "title": "Administrator User Guide",
    "category": "getting-started",
    "audience": "admin",
    "content": "...",
    "excerpt": "Comprehensive guide for platform administrators"
  }'

# Client guide
curl -X POST http://localhost:3001/api/documentation \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "client-user-guide",
    "title": "Client User Guide",
    "category": "getting-started",
    "audience": "client",
    "content": "...",
    "excerpt": "Get started with managing your inventory"
  }'
```

## Usage

### Client Portal

Add to navigation:

```typescript
// apps/portal/src/App.tsx or routing file
import { DocumentationViewer } from '@/components/DocumentationViewer';

// Add route
<Route path="/help" element={<DocumentationViewer audience="client" />} />
```

### Admin Dashboard

```typescript
// apps/web/src/App.tsx or routing file
import { DocumentationViewer } from '@/components/DocumentationViewer';

// Add route
<Route path="/documentation" element={<DocumentationViewer audience="admin" />} />
```

## Features

- **Live Updates**: Update documentation without redeployment
- **Markdown Support**: Rich formatting with GitHub Flavored Markdown
- **Categorization**: Organize docs by category
- **Search**: Full-text search across all documentation
- **Version Control**: Track changes with changelog
- **View Analytics**: Track which docs are most viewed
- **Audience Targeting**: Separate docs for admin vs client users

## API Endpoints

### Public (No Auth Required)

- `GET /api/documentation` - List all published docs
- `GET /api/documentation/:slug` - Get specific doc
- `GET /api/documentation/categories` - List categories
- `GET /api/documentation/search?q=term` - Search docs

### Admin Only

- `POST /api/documentation` - Create new doc
- `PATCH /api/documentation/:id` - Update doc
- `DELETE /api/documentation/:id` - Delete doc
- `GET /api/documentation/admin/all` - View unpublished docs

## Categories

Recommended categories:

- `getting-started` - Initial setup and onboarding
- `features` - Feature explanations
- `how-to` - Step-by-step guides
- `faq` - Frequently asked questions
- `troubleshooting` - Common issues and solutions
- `api` - API documentation (for integrations)

## Updating Documentation

### Via Admin UI (Recommended)

1. Log in as admin
2. Navigate to Settings > Documentation
3. Select document to edit or create new
4. Edit markdown content in live preview editor
5. Save changes (updates immediately)

### Via API

```bash
curl -X PATCH http://localhost:3001/api/documentation/:id \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Updated content...",
    "version": "1.1.0",
    "changeNotes": "Added section on new features"
  }'
```

### Via File Import

```typescript
import { DocumentationService } from "./services/documentation.service";

await DocumentationService.importFromMarkdown(
  "./docs/new-feature-guide.md",
  {
    slug: "new-feature-guide",
    title: "New Feature Guide",
    category: "features",
    audience: "both",
    excerpt: "Learn about the latest features",
    tags: ["features", "updates"],
  },
  userId,
);
```

## Markdown Formatting

The documentation viewer supports:

- **Headings**: `# H1`, `## H2`, `### H3`
- **Lists**: Bulleted (`-`, `*`) and numbered (`1.`)
- **Links**: `[text](url)`
- **Images**: `![alt](url)` (use /uploads for hosted images)
- **Code**: Inline \`code\` and fenced \`\`\`code blocks\`\`\`
- **Tables**: GitHub Flavored Markdown tables
- **Blockquotes**: `> quote`
- **Bold**: `**bold**`
- **Italic**: `*italic*`
- **Strikethrough**: `~~strikethrough~~`

## Best Practices

1. **Keep it concise**: Break long guides into multiple docs
2. **Use categories**: Organize logically
3. **Add screenshots**: Include placeholders like `[Screenshot: Dashboard]`
4. **Update regularly**: Keep docs in sync with features
5. **Version changes**: Document what changed in each update
6. **Test links**: Ensure all internal/external links work
7. **Use search-friendly titles**: Clear, descriptive titles
8. **Add excerpts**: Help users find the right doc

## Troubleshooting

**Documentation not showing:**

- Check `isPublished` is true
- Verify `audience` matches viewer
- Check database connection

**Markdown not rendering:**

- Ensure react-markdown is installed
- Check for syntax errors in markdown
- Verify remark-gfm plugin is loaded

**Search not working:**

- Check database text search is enabled
- Verify content is indexed
- Try shorter/different search terms
