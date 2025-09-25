package database

import "github.com/artyom-kalman/kbu-daily-menu/internal/menu"

type Database interface {
	SelectRow(string) ([]*menu.MenuItem, error)
	UpdateDishes(string, []*menu.MenuItem) error
	Connect() error
	Close() error
}
