# Contributing to X402

Thank you for your interest in contributing to X402! This guide will help you get started.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/nirholas/x402.git
   cd x402
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run tests**
   ```bash
   pnpm test
   ```

## Project Structure

```
x402/
├── packages/           # Published npm packages
│   └── sdk/           # @x402/sdk
├── facilitator/       # Payment verification server
├── yield-tracker/     # USDs yield monitoring service
├── cli/               # Command-line interface
├── contracts/         # Solidity smart contracts
├── sperax/            # Sperax integration & MCP tools
├── web-app/           # Web components
├── examples/          # Integration examples
└── docs/              # Documentation
```

## Code Style

- **TypeScript**: Use strict mode, prefer const, use explicit types
- **Solidity**: Follow Solidity style guide, use NatSpec comments
- **Formatting**: Run `pnpm format` before committing
- **Linting**: Run `pnpm lint` to check for issues

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit with conventional commits (`feat:`, `fix:`, `docs:`, etc.)
6. Push to your fork
7. Open a Pull Request

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Formatting
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance

## Testing

### TypeScript Tests
```bash
pnpm test
```

### Contract Tests
```bash
pnpm contracts:test
```

### Integration Tests
```bash
pnpm test:integration
```

## Security

If you discover a security vulnerability, please **DO NOT** open a public issue. Instead, email security@example.com with details.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
