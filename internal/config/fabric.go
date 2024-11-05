package config

import (
	"errors"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria"
)

var cacheMenuService *cafeteria.MenuService

func InitApp(dbSourcePath string, peonyUrl string, azileaUrl string) {
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
}

func GetMenuService() (*cafeteria.MenuService, error) {
	if cacheMenuService == nil {
		return nil, errors.New("Menu service is initialized")
	}
	return cacheMenuService, nil
}
