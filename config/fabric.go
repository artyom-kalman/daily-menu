package config

import (
	"errors"

	"github.com/artyom-kalman/kbu-daily-menu/internal/database"
	"github.com/artyom-kalman/kbu-daily-menu/internal/repositories/azilea"
	"github.com/artyom-kalman/kbu-daily-menu/internal/repositories/peony"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/chatgpt"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menu"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menudescription"
	"github.com/artyom-kalman/kbu-daily-menu/internal/utils/menuparser"
)

var cacheMenuService *menu.MenuService

func InitApp(dbSourcePath string, peonyUrl string, azileaUrl string) error {
	database := database.NewMenuDatabase(dbSourcePath)

	gptToken, err := GetEnv("GPT_TOKEN")
	if err != nil {
		return err
	}

	gptUrl, err := GetEnv("GPT_URL")
	if err != nil {
		return err
	}
	gptService := chatgpt.NewChatGPTService(gptToken, gptUrl)

	menuParser := menuparser.NewMenuParser()

	descriptionService := menudescription.NewDescriptionService(gptService)

	peonyFetcher := peony.NewPeonyFetcher(peonyUrl, descriptionService, menuParser)
	azileaFetcher := azilea.NewAzileaFetcher(azileaUrl, descriptionService, menuParser)

	peonyRepo := peony.NewPeonyReporitory(database, peonyFetcher)
	azileaRepo := azilea.NewAzileaRepository(database, azileaFetcher)

	menuService := menu.NewMenuService(
		azileaRepo,
		peonyRepo,
	)

	cacheMenuService = menuService

	return nil
}

func GetMenuService() (*menu.MenuService, error) {
	if cacheMenuService == nil {
		return nil, errors.New("Menu service is initialized")
	}
	return cacheMenuService, nil
}
