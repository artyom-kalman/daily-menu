package menu

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type HTMLParser struct{}

func NewHTMLParser() *HTMLParser {
	return &HTMLParser{}
}

func (p *HTMLParser) ParseMenuItems(body string) ([]string, error) {
	dayOfWeek := int(time.Now().Weekday())

	if dayOfWeek == 6 || dayOfWeek == 0 {
		return []string{"Сегодня выходной"}, nil
	}

	foodList, err := p.extractFoodList(body, dayOfWeek)
	if err != nil {
		return nil, err
	}

	return p.extractFoodItems(foodList)
}

func (p *HTMLParser) extractFoodList(body string, dayOfWeek int) (string, error) {
	regex := regexp.MustCompile(`(?Ums)<ul class="foodList">(.*)<\/ul>`)
	matches := regex.FindAllStringSubmatch(body, dayOfWeek)

	if len(matches) < dayOfWeek {
		return "", errors.New("error parsing body")
	}

	return matches[dayOfWeek-1][1], nil
}

func (p *HTMLParser) extractFoodItems(foodList string) ([]string, error) {
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

	logger.Debug("extracted %d food items from HTML", len(dishes))
	return dishes, nil
}
