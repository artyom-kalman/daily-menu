package config

import (
	"errors"

	"github.com/artyom-kalman/kbu-daily-menu/internal/database"
	"github.com/artyom-kalman/kbu-daily-menu/internal/fetcher"
	"github.com/artyom-kalman/kbu-daily-menu/internal/repository"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/chatgpt"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menu"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menudescription"
)

var cacheMenuService *menu.MenuService

func InitApp(dbSourcePath string, peonyUrl string, azileaUrl string) error {
	gptToken, err := GetEnv("GPT_TOKEN")
	if err != nil {
		return err
	}

	gptUrl, err := GetEnv("GPT_URL")
	if err != nil {
		return err
	}
	gptService := chatgpt.New(gptToken, gptUrl)

	descriptionService := menudescription.New(gptService)

	peonyFetcher := fetcher.New(peonyUrl, descriptionService)
	azileaFetcher := fetcher.New(azileaUrl, descriptionService)

	database := database.New(dbSourcePath)
	peonyRepo := repository.New(repository.PEONY, database, peonyFetcher)
	azileaRepo := repository.New(repository.AZILEA, database, azileaFetcher)

	cacheMenuService = menu.New(
		azileaRepo,
		peonyRepo,
	)

	cacheMenuService.GetAzileaMenu()
	cacheMenuService.GetPeonyMenu()

	return nil
}

func MenuService() (*menu.MenuService, error) {
	if cacheMenuService == nil {
		return nil, errors.New("menu service is not initialized")
	}
	return cacheMenuService, nil
}
