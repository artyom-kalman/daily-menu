package menu

import (
	"context"
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type MenuFetcherService struct {
	htmlParser *MenuParser
	aiService  *MenuAIService
}

func NewMenuFetcherService(url string, aiService AIService) *MenuFetcherService {
	return &MenuFetcherService{
		htmlParser: NewMenuParser(url),
		aiService:  NewMenuAIService(aiService),
	}
}

func (s *MenuFetcherService) FetchMenu() (*Menu, error) {
	return s.FetchMenuWithContext(context.Background())
}

func (s *MenuFetcherService) FetchMenuWithContext(ctx context.Context) (*Menu, error) {
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

	if err := s.aiService.GenerateDescriptions(ctx, menu); err != nil {
		logger.Error("failed to add descriptions to menu: %v", err)
		return nil, fmt.Errorf("failed to add menu descriptions: %w", err)
	}

	logger.Debug("successfully processed menu with %d items", len(menu.Items))
	return menu, nil
}
