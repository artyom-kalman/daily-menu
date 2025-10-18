package database

import (
	"database/sql"
	"fmt"
	"log/slog"
	"os"

	_ "github.com/mattn/go-sqlite3"
)

type Database struct {
	Conn *sql.DB
}

func Init(dbPath string, migrationPath string) (*Database, error) {
	db, err := NewDatabase(dbPath)
	if err != nil {
		return nil, err
	}

	migrator := NewMigrator(db)
	if err := migrator.LoadMigrationsFromFS(os.DirFS("./"), migrationPath); err != nil {
		return nil, fmt.Errorf("failed to load migrations from %s: %w", migrationPath, err)
	}
	if err := migrator.Up(); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return db, nil
}

func NewDatabase(path string) (*Database, error) {
	conn, err := sql.Open("sqlite3", path)
	if err != nil {
		slog.Error("Failed to open database", "err", err)
		return nil, err
	}

	return &Database{
		Conn: conn,
	}, nil
}

func (db *Database) Close() error {
	return db.Conn.Close()
}
