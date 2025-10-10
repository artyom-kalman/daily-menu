package menu

import (
	"context"
	"fmt"
	"time"

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

	// Validate menu with AI
	validation, err := s.aiService.ValidateMenu(ctx, menu)
	if err != nil {
		logger.Error("failed to validate menu: %v", err)
		// Fallback to basic validation
		return s.handleValidationFailure(menu)
	}

	if !validation.IsValid {
		logger.Info("menu validation failed: %s", validation.Reason)
		return s.createEmptyMenu(validation.Message), nil
	}

	// Continue with description generation for valid menus
	if err := s.aiService.GenerateDescriptions(ctx, menu); err != nil {
		logger.Error("failed to add descriptions to menu: %v", err)
		return nil, fmt.Errorf("failed to add menu descriptions: %w", err)
	}

	logger.Debug("successfully processed menu with %d items", len(menu.Items))
	return menu, nil
}

func (s *MenuFetcherService) handleValidationFailure(menu *Menu) (*Menu, error) {
	// Fallback logic if AI validation fails
	if len(menu.Items) == 0 {
		return s.createEmptyMenu("Не удалось проверить меню"), nil
	}

	// If menu has items but validation failed, proceed with description generation
	if err := s.aiService.GenerateDescriptions(context.Background(), menu); err != nil {
		logger.Error("failed to add descriptions during fallback: %v", err)
		return s.createEmptyMenu("Ошибка при обработке меню"), nil
	}

	return menu, nil
}

func (s *MenuFetcherService) createEmptyMenu(message string) *Menu {
	if message == "" {
		message = "Сегодня меню недоступно"
	}

	now := time.Now()
	return &Menu{
		Items: []*MenuItem{
			{
				Name:        message,
				Description: "",
				Spiciness:   0,
			},
		},
		Time: &now,
	}
}
