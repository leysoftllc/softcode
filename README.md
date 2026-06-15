# SoftCode AI – Product Requirements Document (v1.0)

## Vision

SoftCode AI is an intelligent coding assistant built directly into VS Code. It helps developers understand, navigate, debug, and modify their codebases using AI while maintaining full control over costs, security, and code changes.

Unlike traditional AI coding assistants, SoftCode AI focuses on understanding projects deeply through local workspace navigation rather than blindly sending entire repositories to external APIs.

## Goals

- Build an AI assistant inside VS Code.
- Allow developers to chat naturally with their codebase.
- Navigate and understand entire projects.
- Keep API costs low.
- Protect sensitive information.
- Provide safe code modifications with developer approval.

## Target Users

### Primary Users

- Full-stack developers
- Freelancers
- Startup founders
- Agency developers
- Technical teams

### Secondary Users

- Students
- Junior developers
- Open-source contributors

## Core Features (MVP)

### Chat Interface

The extension should provide:

- Persistent chat window
- Streaming responses
- Markdown rendering
- Syntax-highlighted code blocks
- Conversation history
- Clear conversation button

### Workspace Awareness

SoftCode AI must automatically detect the opened VS Code workspace.

Capabilities:

- Read project structure
- Navigate folders
- Read files
- Read selected code
- Search filenames
- Search file contents
- Understand relationships between files

Example:

User: "Where is WhatsApp onboarding implemented?"

SoftCode AI:

- Searches the workspace
- Finds matching files
- Reads relevant code
- Explains the flow

### Context Sources

SoftCode AI can use:

- Current file
- Selected text
- Open tabs
- User-attached files
- Workspace search results

SoftCode AI MUST NOT automatically send the entire project to the API.

### Claude Integration

Supported models:

#### Haiku

Use cases:

- Small questions
- Code explanation
- Autocomplete

#### Sonnet (Default)

Use cases:

- Bug fixing
- Refactoring
- Feature generation
- Code reviews

#### Opus

Use cases:

- Architecture analysis
- Complex debugging
- Multi-file reasoning

### File Navigation Engine

Capabilities:

- Search files by name
- Search symbols
- Search text content
- Build file tree
- Open related files

Ignored directories:

- node_modules
- .git
- vendor
- tmp
- log
- build
- dist
- coverage

### Code Assistance

SoftCode AI should:

- Explain code
- Generate code
- Refactor code
- Fix bugs
- Generate tests
- Suggest improvements
- Review pull requests

### Safe Editing System

Phase 1: AI suggests code only.

Phase 2: AI generates diffs.

Phase 3: User clicks "Apply Changes."

Phase 4: Undo support.

### Cost Controls

Features:

- Daily spending limit
- Monthly budget
- Token usage dashboard
- Estimated request cost
- Request confirmation for expensive operations

### Security

SoftCode AI must:

- Never send `.env` files
- Never send secrets
- Ignore API keys
- Ignore certificates
- Require user approval before sending large contexts

API keys are stored using VS Code SecretStorage.

### Commands

- SoftCode AI: Open Chat
- SoftCode AI: Explain Selected Code
- SoftCode AI: Fix This Error
- SoftCode AI: Refactor Current File
- SoftCode AI: Generate Tests
- SoftCode AI: Search Workspace
- SoftCode AI: Clear Conversation
- SoftCode AI: Configure API Key

## Technical Architecture

Extension backend:

- TypeScript

UI:

- React
- VS Code Webview

Bundler:

- Vite or esbuild

Storage:

- VS Code SecretStorage

AI provider:

- Anthropic Claude API

## Project Structure

```text
softcode-ai/
├── src/
├── webview/
├── package.json
├── tsconfig.json
├── README.md
```

Backend modules:

- extension.ts
- webviewProvider.ts
- claudeClient.ts
- workspaceIndexer.ts
- contextBuilder.ts
- patchManager.ts
- usageTracker.ts
- securityFilter.ts

Frontend components:

- App.tsx
- Chat.tsx
- Message.tsx
- FileChip.tsx
- ModelSelector.tsx

## MVP Success Criteria

A developer can:

1. Open SoftCode AI.
2. Ask questions about their project.
3. Select code and get explanations.
4. Attach files to conversations.
5. Receive Claude responses.
6. Track token usage.
7. Switch between Claude models.

If these seven actions work reliably, SoftCode AI v1.0 is considered successful.

## Future Roadmap

### v1.1

- Diff previews
- Apply changes

### v1.2

- Terminal integration
- Test runner integration

### v1.3

- Git integration
- Pull request reviews

### v2.0

- Multi-agent workflows
- Team collaboration
- SoftCode Cloud Sync

## Product Tagline

**SoftCode AI**

Understand your code. Build with confidence.
