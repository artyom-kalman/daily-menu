package interfaces

import "github.com/artyom-kalman/kbu-daily-menu/internal/domain"

type Database interface {
	SelectRow(string) ([]*domain.MenuItem, error)
	UpdateDishes(string, []*domain.MenuItem) error
	Connect() error
	Close() error
}
