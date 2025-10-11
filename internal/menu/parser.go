package menu

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/http/fetcher"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type MenuParser struct {
	fetcher *fetcher.HTTPFetcher
}

func NewMenuParser(url string) *MenuParser {
	return &MenuParser{
		fetcher: fetcher.NewHTTPFetcher(url),
	}
}

func (p *MenuParser) ParseMenu() (*Menu, error) {
	body, err := p.fetcher.Fetch()
	if err != nil {
		logger.ErrorErr("Failed to fetch HTML content", err)
		return nil, fmt.Errorf("failed to fetch menu: %w", err)
	}

	loc, _ := time.LoadLocation("Asia/Seoul")
	now := time.Now().In(loc)

	foodList, err := p.extractFoodList(body, int(now.Weekday()))
	if err != nil {
		return nil, err
	}

	foodItems, err := p.extractFoodItems(foodList)
	menu := NewMenuFromDishes(foodItems, &now)

	return menu, nil
}

func (p *MenuParser) extractFoodList(body string, dayOfWeek int) (string, error) {
	regex := regexp.MustCompile(`(?Ums)<ul class="foodList">(.*)<\/ul>`)
	matches := regex.FindAllStringSubmatch(body, -1)

	// The website typically only shows weekdays (Mon-Fri), not weekends
	// Convert dayOfWeek to appropriate index:
	// Sunday(0) -> Friday(5), Monday(1) -> Monday(1), Tuesday(2) -> Tuesday(2), etc.
	// Saturday(6) -> Friday(5)
	var targetDay int
	switch dayOfWeek {
	case 0: // Sunday
		targetDay = 5 // Use Friday's menu
	case 6: // Saturday
		targetDay = 5 // Use Friday's menu
	default:
		targetDay = dayOfWeek
	}

	if len(matches) < targetDay {
		logger.Debug(fmt.Sprintf("Found %d foodList elements, but need day %d", len(matches), targetDay))
		return "", errors.New("error parsing body")
	}

	return matches[targetDay-1][1], nil
}

func (p *MenuParser) extractFoodItems(foodList string) ([]string, error) {
	regex := regexp.MustCompile(`(?Ums)class="foodItem">(.*)<`)
	matches := regex.FindAllStringSubmatch(foodList, -1)

	dishes := make([]string, 0, len(matches))

	for _, match := range matches {
		newDish := strings.TrimSpace(match[1])

		if newDish == "" {
			continue
		}
		dishes = append(dishes, newDish)
	}

	// If no valid dishes found, it might be a holiday
	if len(dishes) == 0 {
		logger.Info("No valid menu items found - likely holiday or weekend")
		return []string{}, nil
	}

	return dishes, nil
}
