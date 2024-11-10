package interfaces

import (
	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
)

type MenuRepository interface {
	GetMenu() (*domain.Menu, error)
}
