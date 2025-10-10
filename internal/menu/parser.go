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
		logger.Error("failed to fetch HTML content: %v", err)
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
	matches := regex.FindAllStringSubmatch(body, dayOfWeek)

	if len(matches) < dayOfWeek {
		return "", errors.New("error parsing body")
	}

	return matches[dayOfWeek-1][1], nil
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

	return dishes, nil
}
