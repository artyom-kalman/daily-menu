package interfaces

import "github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"

type MenuFetcher interface {
	FetchMenu() (*entities.Menu, error)
}
