package config

import (
	"errors"
	"log"
	"os"

	"github.com/artyom-kalman/kbu-daily-menu/internal/database"
	"github.com/artyom-kalman/kbu-daily-menu/internal/repositories/azilea"
	"github.com/artyom-kalman/kbu-daily-menu/internal/repositories/peony"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/chatgpt"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menu"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menudescription"
	"github.com/artyom-kalman/kbu-daily-menu/internal/utils/menuparser"
)

var cacheMenuService *menu.MenuService

func InitApp(dbSourcePath string, peonyUrl string, azileaUrl string) {
	database := database.NewMenuDatabase(dbSourcePath)

	chatgptApiKey := os.Getenv("AIML_API_KEY")
	if chatgptApiKey == "" {
		log.Fatal("Error getting api key from env")
	}

	menuParser := menuparser.NewMenuParser()

	gptService := chatgpt.NewChatGPTService(chatgptApiKey, "gpt-4o")

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
}

func GetMenuService() (*menu.MenuService, error) {
	if cacheMenuService == nil {
		return nil, errors.New("Menu service is initialized")
	}
	return cacheMenuService, nil
}
