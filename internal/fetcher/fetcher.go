package fetcher

import (
	"io"
	"net/http"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menudescription"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menuparser"
)

type MenuFetcher struct {
	url      string
	menuDesc *menudescription.MenuDescriptionService
}

func New(url string, ds *menudescription.MenuDescriptionService) *MenuFetcher {
	return &MenuFetcher{
		url:      url,
		menuDesc: ds,
	}
}

func (f *MenuFetcher) FetchMenu() (*domain.Menu, error) {
	resp, err := http.Get(f.url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.Reader(resp.Body))
	if err != nil {
		return nil, err
	}

	dishes, err := menuparser.ParseBody(string(body))
	if err != nil {
		return nil, err
	}

	now := time.Now()
	menu := domain.NewMenuFromDishes(dishes, &now)
	if len(menu.Items) < 1 {
		menu.Items = append(menu.Items, &domain.MenuItem{
			Name: "Сегодня тут пусто",
		})
		return menu, nil
	}

	err = f.menuDesc.AddDescriptionToMenu(menu)
	if err != nil {
		return nil, err
	}

	return menu, nil
}
