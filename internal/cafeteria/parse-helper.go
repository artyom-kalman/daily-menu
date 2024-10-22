package cafeteria

import (
	"errors"
	"regexp"
	"strings"
	"time"
)

func parseBody(body string) ([]string, error) {
	dayOfWeek := time.Now().Weekday()

	foodList, err := findFoodList(body, int(dayOfWeek))
	if err != nil {
		return nil, err
	}

	return findFoodItems(foodList)
}

func findFoodList(body string, dayOfWeek int) (string, error) {
	regex := regexp.MustCompile(`(?Ums)<ul class="foodList">(.*)<\/ul>`)
	matches := regex.FindAllStringSubmatch(body, dayOfWeek)

	if len(matches) < dayOfWeek {
		return "", errors.New("error parsing body")
	}

	return matches[dayOfWeek-1][1], nil
}

func findFoodItems(foodList string) ([]string, error) {
	regex := regexp.MustCompile(`(?Ums)class="foodItem">(.*)<`)
	matches := regex.FindAllStringSubmatch(foodList, -1)

	dishes := make([]string, len(matches))

	for i, match := range matches {
		newDish := strings.TrimSpace(match[1])

		if newDish == "" {
			continue
		}
		dishes[i] = newDish
	}

	return dishes, nil
}
