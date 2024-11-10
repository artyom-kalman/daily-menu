package azilea

import (
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces"
)

const AZILEA = "azilea"

type AzileaRepository struct {
	database interfaces.Database
	fetcher  interfaces.MenuFetcher
	menu     *domain.Menu
}

func NewAzileaRepository(database interfaces.Database, fetcher interfaces.MenuFetcher) *AzileaRepository {
	return &AzileaRepository{
		menu:     nil,
		database: database,
		fetcher:  fetcher,
	}
}

func (r *AzileaRepository) GetMenu() (*domain.Menu, error) {
	today := time.Now().Truncate(24 * time.Hour)
	if r.menu != nil && r.menu.Date().Compare(today) == 0 {
		return r.menu, nil
	}

	dishes, err := r.database.SelectRow(AZILEA)
	if err != nil {
		return nil, err
	}

	if dishes != nil {
		todaysMenu := &domain.Menu{
			Items: dishes,
			Time:  &today,
		}
		r.menu = todaysMenu
		return todaysMenu, nil
	}

	menu, err := r.fetcher.FetchMenu()
	if err != nil {
		return nil, err
	}
	r.menu = menu

	err = r.database.UpdateDishes(AZILEA, r.menu.Items)
	if err != nil {
		return nil, err
	}

	return menu, nil
}
