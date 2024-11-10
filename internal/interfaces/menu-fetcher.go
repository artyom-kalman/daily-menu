package interfaces

import (
	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
)

type MenuFetcher interface {
	FetchMenu() (*domain.Menu, error)
}
