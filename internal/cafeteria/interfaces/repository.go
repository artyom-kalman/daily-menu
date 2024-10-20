package interfaces

import "github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"

type MenuRepository interface {
	GetMenu() (*entities.Menu, error)
}
