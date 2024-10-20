package interfaces

import (
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
)

type Database interface {
	SelectRow(string) ([]*entities.MenuItem, error)
	UpdateDishes(string, []*entities.MenuItem) error
	Connect() error
	Close() error
}
