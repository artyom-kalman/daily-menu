# Agent Guidelines for kbu-daily-menu

## Build & Test Commands
- Build: `go build -o tmp/main cmd/main.go`
- Run: `go run cmd/main.go`
- Test: `go test ./...` (no tests currently exist)
- Single test: `go test -run TestName ./package/path`
- Lint: `gofmt -d .` and `go vet ./...`

## Code Style Guidelines
- **Imports**: Group standard library, third-party, then local packages
- **Formatting**: Use standard Go formatting (`gofmt`)
- **Types**: Use explicit types in function signatures and struct fields
- **Naming**: CamelCase for exported, camelCase for unexported
- **Error Handling**: Wrap errors with `fmt.Errorf` and `%w` verb
- **Logging**: Use `pkg/logger` package with Info/Debug/Error functions
- **Structure**: Follow domain-driven design with internal/ packages