package config

import (
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria"
)

var cacheMenuService *cafeteria.MenuService

func Fabric(dbSourcePath string, peonyUrl string, azileaUrl string) *cafeteria.MenuService {
	if cacheMenuService != nil {
		return cacheMenuService
	}

	database := cafeteria.NewMenuDatabase(dbSourcePath)
	peonyFetcher := cafeteria.NewPeonyFetcher(peonyUrl)
	azileaFetcher := cafeteria.NewAzileaFetcher(azileaUrl)

	peonyRepo := cafeteria.NewPeonyReporitory(database, peonyFetcher)
	azileaRepo := cafeteria.NewAzileaRepository(database, azileaFetcher)
	menuService := cafeteria.NewMenuService(
		azileaRepo,
		peonyRepo,
	)

	cacheMenuService = menuService

	return menuService
}
