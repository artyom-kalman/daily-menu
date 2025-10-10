package menu

import (
	"context"
	"fmt"
	"log/slog"
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
		logger.ErrorErr("Failed to parse HTML content", err)
		return nil, fmt.Errorf("failed to parse menu: %w", err)
	}

	// Validate menu with AI
	validation, err := s.aiService.ValidateMenu(ctx, menu)
	if err != nil {
		logger.ErrorErr("Failed to validate menu", err)
		// Fallback to basic validation
		return s.handleValidationFailure(menu)
	}

	if !validation.IsValid {
		logger.InfoWithFields("Menu validation failed", slog.String("reason", validation.Reason))
		return s.createEmptyMenu(validation.Message), nil
	}

	// Continue with description generation for valid menus
	if err := s.aiService.GenerateDescriptions(ctx, menu); err != nil {
		logger.ErrorErr("Failed to add descriptions to menu", err)
		return nil, fmt.Errorf("failed to add menu descriptions: %w", err)
	}

	logger.DebugWithFields("Successfully processed menu", slog.Int("item_count", len(menu.Items)))
	return menu, nil
}

func (s *MenuFetcherService) handleValidationFailure(menu *Menu) (*Menu, error) {
	// Fallback logic if AI validation fails
	if len(menu.Items) == 0 {
		return s.createEmptyMenu("Не удалось проверить меню"), nil
	}

	// If menu has items but validation failed, proceed with description generation
	if err := s.aiService.GenerateDescriptions(context.Background(), menu); err != nil {
		logger.ErrorErr("Failed to add descriptions during fallback", err)
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
