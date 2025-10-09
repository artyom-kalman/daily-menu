package database

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
)

type Migrator struct {
	db         *Database
	migrations []Migration
}

type Migration struct {
	Version string
	SQL     string
}

func NewMigrator(db *Database) *Migrator {
	return &Migrator{
		db: db,
	}
}

func (m *Migrator) AddMigration(version, sql string) {
	m.migrations = append(m.migrations, Migration{
		Version: version,
		SQL:     sql,
	})
}

func (m *Migrator) Up() error {
	if err := m.createMigrationsTable(); err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	appliedVersions, err := m.getAppliedVersions()
	if err != nil {
		return fmt.Errorf("failed to get applied versions: %w", err)
	}

	sort.Slice(m.migrations, func(i, j int) bool {
		return m.migrations[i].Version < m.migrations[j].Version
	})

	for _, migration := range m.migrations {
		if _, applied := appliedVersions[migration.Version]; applied {
			continue
		}

		if err := m.applyMigration(migration); err != nil {
			return fmt.Errorf("failed to apply migration %s: %w", migration.Version, err)
		}
	}

	return nil
}

func (m *Migrator) createMigrationsTable() error {
	_, err := m.db.Conn.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	return err
}

func (m *Migrator) getAppliedVersions() (map[string]bool, error) {
	rows, err := m.db.Conn.Query("SELECT version FROM schema_migrations")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := make(map[string]bool)
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return nil, err
		}
		versions[version] = true
	}

	return versions, nil
}

func (m *Migrator) applyMigration(migration Migration) error {
	tx, err := m.db.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(migration.SQL); err != nil {
		return err
	}

	if _, err := tx.Exec("INSERT INTO schema_migrations (version) VALUES (?)", migration.Version); err != nil {
		return err
	}

	return tx.Commit()
}

func (m *Migrator) LoadMigrationsFromFS(migrationFS fs.FS, dir string) error {
	entries, err := fs.ReadDir(migrationFS, dir)
	if err != nil {
		return fmt.Errorf("failed to read migration directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		version := strings.TrimSuffix(entry.Name(), ".sql")
		path := filepath.Join(dir, entry.Name())

		content, err := fs.ReadFile(migrationFS, path)
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", path, err)
		}

		m.AddMigration(version, string(content))
	}

	return nil
}
