package menu

import (
	"context"
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

const (
	emptyMenuMessage = "Сегодня тут пусто"
)

type MenuService struct {
	htmlParser *MenuParser
	aiService  *MenuAIService
}

func NewMenuService(url string, aiService AIService) *MenuService {
	return &MenuService{
		htmlParser: NewMenuParser(url),
		aiService:  NewMenuAIService(aiService),
	}
}

func (s *MenuService) GetDailyMenu() (*Menu, error) {
	return s.GetDailyMenuWithContext(context.Background())
}

func (s *MenuService) GetDailyMenuWithContext(ctx context.Context) (*Menu, error) {
	logger.Info("starting daily menu fetch process")

	menu, err := s.htmlParser.ParseMenu()
	if err != nil {
		logger.Error("failed to parse HTML content: %v", err)
		return nil, fmt.Errorf("failed to parse menu: %w", err)
	}

	if len(menu.Items) == 0 {
		logger.Info("no menu items found, creating empty menu placeholder")
		menu.Items = append(menu.Items, &MenuItem{
			Name: emptyMenuMessage,
		})
		return menu, nil
	}

	logger.Debug("adding descriptions to %d menu items", len(menu.Items))
	if err := s.aiService.GenerateDescriptions(menu); err != nil {
		logger.Error("failed to add descriptions to menu: %v", err)
		return nil, fmt.Errorf("failed to add menu descriptions: %w", err)
	}

	logger.Info("successfully processed menu with %d items", len(menu.Items))
	return menu, nil
}
