package menu

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"

	"github.com/artyom-kalman/kbu-daily-menu/internal/http/fetcher"
)

type MenuParser struct {
	fetcher *fetcher.HTTPFetcher
	clock   Clock
}

func NewMenuParser(url string, clock Clock) *MenuParser {
	if clock == nil {
		clock = NewKSTClock()
	}
	return &MenuParser{
		fetcher: fetcher.NewHTTPFetcher(url),
		clock:   clock,
	}
}

func (p *MenuParser) ParseMenu(ctx context.Context) (*Menu, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	body, err := p.fetcher.FetchWithContext(ctx)
	if err != nil {
		slog.Error("Failed to fetch HTML content", "error", err)
		return nil, fmt.Errorf("failed to fetch menu: %w", err)
	}

	now := p.clock.Now()

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
		slog.Debug("Found foodList elements, but need day",
			"found", len(matches),
			"target_day", targetDay)
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
		slog.Info("No valid menu items found - likely holiday or weekend")
		return []string{}, nil
	}

	return dishes, nil
}
