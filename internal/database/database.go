package database

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
)

type Database struct {
	Conn *sql.DB
	path string
}

func NewDatabase(path string) *Database {
	_, err := sql.Open("sqlite3", path)
	if err != nil {
		panic(err)
	}

	return &Database{
		path: path,
	}
}

func (db *Database) Connect() error {
	conn, err := sql.Open("sqlite3", db.path)
	if err != nil {
		return err
	}

	db.Conn = conn
	return nil
}

func (db *Database) Close() error {
	return db.Conn.Close()
}
