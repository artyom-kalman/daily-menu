package cafeteria

import (
	"regexp"
	"strings"
)

const DISH_LIMIT = 7

func parseBody(response string) ([]string, error) {
	regex := regexp.MustCompile(`(?Ums)class="foodItem">(.*)<`)
	matches := regex.FindAllStringSubmatch(response, -1)

	dishes := make([]string, len(matches))

	for i, match := range matches {
		newDish := strings.TrimSpace(match[1])

		if newDish == "" {
			continue
		}

		dishes[i] = newDish
	}

	if len(dishes) > DISH_LIMIT {
		return dishes[len(dishes)-DISH_LIMIT:], nil
	} else {
		return dishes, nil
	}
}
