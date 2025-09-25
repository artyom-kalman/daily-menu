package menu

import (
	"fmt"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

const (
	emptyMenuMessage = "Сегодня тут пусто"
)

type MenuService struct {
	httpFetcher *HTTPFetcher
	htmlParser  *HTMLParser
	aiService   *MenuAIService
}

func NewMenuService(url string, aiService AIService) *MenuService {
	return &MenuService{
		httpFetcher: NewHTTPFetcher(url),
		htmlParser:  NewHTMLParser(),
		aiService:   NewMenuAIService(aiService),
	}
}

func (s *MenuService) GetDailyMenu() (*Menu, error) {
	return s.GetDailyMenuWithContext(nil)
}

func (s *MenuService) GetDailyMenuWithContext(ctx any) (*Menu, error) {
	logger.Info("starting daily menu fetch process")

	// Step 1: Fetch HTML content
	htmlContent, err := s.httpFetcher.Fetch()
	if err != nil {
		logger.Error("failed to fetch HTML content: %v", err)
		return nil, fmt.Errorf("failed to fetch menu: %w", err)
	}

	// Step 2: Parse HTML to get dish names
	dishNames, err := s.htmlParser.ParseMenuItems(htmlContent)
	if err != nil {
		logger.Error("failed to parse HTML content: %v", err)
		return nil, fmt.Errorf("failed to parse menu: %w", err)
	}

	logger.Debug("parsed %d dish names from HTML", len(dishNames))

	// Step 3: Create menu object
	now := time.Now()
	menu := NewMenuFromDishes(dishNames, &now)

	// Step 4: Handle empty menu case
	if len(menu.Items) == 0 {
		logger.Info("no menu items found, creating empty menu placeholder")
		menu.Items = append(menu.Items, &MenuItem{
			Name: emptyMenuMessage,
		})
		return menu, nil
	}

	// Step 5: Generate AI descriptions
	logger.Debug("adding descriptions to %d menu items", len(menu.Items))
	if err := s.aiService.GenerateDescriptions(menu); err != nil {
		logger.Error("failed to add descriptions to menu: %v", err)
		return nil, fmt.Errorf("failed to add menu descriptions: %w", err)
	}

	logger.Info("successfully processed menu with %d items", len(menu.Items))
	return menu, nil
}
