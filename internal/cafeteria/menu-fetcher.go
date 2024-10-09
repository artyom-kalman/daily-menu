package cafeteria

import (
	"io"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
)

type MenuFetcher struct {
}

func NewMenuFetcher() *MenuFetcher {
	return &MenuFetcher{}
}

func (f *MenuFetcher) FetchMenu(url string) (*entities.Menu, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.Reader(resp.Body))
	if err != nil {
		return nil, err
	}

	dishes, err := parseBody(string(body))
	if err != nil {
		return nil, err
	}

	menu := entities.NewMenuFromDishes(dishes)
	if len(menu.Items) < 1 {
		menu.Items = append(menu.Items, &entities.MenuItem{
			Name: "Сегодня тут пусто",
		})
		return menu, nil
	}

	err = AddDescriptionToMenu(menu)
	if err != nil {
		return nil, err
	}

	return menu, nil
}
