package azilea

import (
	"io"
	"net/http"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menudescription"
	"github.com/artyom-kalman/kbu-daily-menu/internal/utils/menuparser"
)

type AzileaFetcher struct {
	Url                    string
	menuDescriptionService *menudescription.MenuDescriptionService
	menuParser             *menuparser.MenuParser
}

func NewAzileaFetcher(url string, descriptionService *menudescription.MenuDescriptionService, menuParser *menuparser.MenuParser) *AzileaFetcher {
	return &AzileaFetcher{
		Url:                    url,
		menuParser:             menuParser,
		menuDescriptionService: descriptionService,
	}
}

func (f *AzileaFetcher) FetchMenu() (*domain.Menu, error) {
	resp, err := http.Get(f.Url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.Reader(resp.Body))
	if err != nil {
		return nil, err
	}

	dishes, err := f.menuParser.ParseBody(string(body))
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

	err = f.menuDescriptionService.AddDescriptionToMenu(menu)
	if err != nil {
		return nil, err
	}

	return menu, nil
}
