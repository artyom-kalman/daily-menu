package cafeteria

import (
	"io"
	"net/http"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
)

type PeonyFetcher struct {
	Url string
}

func NewPeonyFetcher(url string) *PeonyFetcher {
	return &PeonyFetcher{
		Url: url,
	}
}

func (f *PeonyFetcher) FetchMenu() (*entities.Menu, error) {
	resp, err := http.Get(f.Url)
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

	now := time.Now()
	menu := entities.NewMenuFromDishes(dishes, &now)
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
