# Contributing to Lens

Thank you for your interest in contributing to Lens! 🎉

## Development Setup

### Prerequisites

- Bun 1.0+
- Node.js 18+ (for compatibility testing)
- Git

### Clone and Install

```bash
git clone https://github.com/SylphxAI/code.git
cd code
bun install
```

### Project Structure

```
packages/
  lens/           # Main package (re-exports)
  lens-core/      # Core types (zero deps)
  lens-server/    # Server runtime
  lens-client/    # Client SDK
  lens-react/     # React hooks
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Changes

```bash
# Edit code in packages/lens-*
cd packages/lens-core
# ... make changes ...
```

### 3. Type Check

```bash
bun run type-check
```

### 4. Test

```bash
bun test
```

### 5. Commit

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat(lens-core): add support for nested relations"
git commit -m "fix(lens-client): handle connection errors gracefully"
git commit -m "docs(lens): update getting started guide"
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Maintenance

### 6. Push and PR

```bash
git push origin feat/your-feature-name
```

Create a pull request on GitHub.

## Coding Standards

### TypeScript

- Use strict mode
- Avoid `any` (use `unknown` if needed)
- Prefer type inference over explicit types
- Use `interface` for objects, `type` for unions

```typescript
// ✅ Good
interface User {
  id: string;
  name: string;
}

type Status = 'active' | 'inactive';

// ❌ Bad
type User = {
  id: string;
  name: string;
};

interface Status extends String {} // Don't extend primitives
```

### Naming

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`

### Comments

- Use JSDoc for public APIs
- Explain **WHY**, not **WHAT**
- Keep comments up-to-date

```typescript
/**
 * Apply field selection to data
 *
 * This performs server-side projection to minimize data transfer.
 * Only selected fields are included in the result.
 *
 * @example
 * ```ts
 * projectData(user, { id: true, name: true })
 * // { id: '1', name: 'John' }
 * ```
 */
export function projectData<T>(data: T, selection?: Selection<T>): any {
  // ...
}
```

### File Organization

```typescript
// 1. Imports (external first, then internal)
import { Observable } from 'rxjs';
import type { Selection } from '@sylphx/lens-core';

// 2. Type definitions
export interface DataSource<T> {
  getById(id: string): Promise<T | null>;
  // ...
}

// 3. Implementation
export class QueryResolver<T> {
  // ...
}

// 4. Utilities/helpers (if any)
function isStreamMode(value: any): value is StreamMode {
  // ...
}
```

## Testing

### Unit Tests

```typescript
// use-query.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGet } from './use-query';

describe('useGet', () => {
  it('should fetch data', async () => {
    const { result } = renderHook(() =>
      useGet(mockModel, { where: { id: '1' } })
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ id: '1', name: 'John' });
    });
  });
});
```

### Test Coverage

- Core logic: 80%+
- Critical paths: 100%
- Edge cases: Important ones

### Running Tests

```bash
# All tests
bun test

# Watch mode
bun test:watch

# Specific package
cd packages/lens-core && bun test
```

## Documentation

### README Updates

- Keep examples up-to-date
- Add new features to feature lists
- Update API reference

### JSDoc

```typescript
/**
 * Brief description (one line)
 *
 * Longer description explaining the purpose and usage.
 * Can be multiple paragraphs.
 *
 * @param input - Description of parameter
 * @returns Description of return value
 *
 * @example
 * ```ts
 * const result = myFunction({ foo: 'bar' });
 * ```
 */
```

### Docs Files

Add guides to `packages/lens/docs/`:
- `GETTING_STARTED.md` - Tutorials
- `EMBEDDED.md` - Embedded mode
- `EXAMPLES.md` - Real-world examples
- `API.md` - API reference

## Pull Request Process

### Before Submitting

- [ ] Code follows style guidelines
- [ ] Tests pass (`bun test`)
- [ ] Types check (`bun run type-check`)
- [ ] Documentation updated
- [ ] Commit messages follow Conventional Commits
- [ ] No breaking changes (or documented in PR)

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Checklist
- [ ] Tests pass
- [ ] Types check
- [ ] Documentation updated
- [ ] No breaking changes
```

### Review Process

1. Maintainer reviews code
2. Feedback addressed
3. Tests pass
4. PR approved
5. Squash and merge

## Release Process

Maintainers only:

```bash
# Update versions
bun changeset

# Commit changeset
git add .changeset
git commit -m "chore: version bump"

# CI will publish to npm
git push
```

## Getting Help

- **Discord**: [Join our community](https://discord.gg/sylphx)
- **Issues**: [GitHub Issues](https://github.com/SylphxAI/code/issues)
- **Discussions**: [GitHub Discussions](https://github.com/SylphxAI/code/discussions)

## Code of Conduct

- Be respectful
- Be constructive
- Be collaborative
- Be inclusive

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors are recognized in:
- GitHub contributors page
- Release notes
- README (for significant contributions)

Thank you for contributing! 🙏
