package repository

import (
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/internal/fetcher"
	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces"
)

type coffeteria string

const (
	PEONY  coffeteria = "peony"
	AZILEA coffeteria = "azilea"
)

type Repository struct {
	coffeteria coffeteria
	menu       *domain.Menu
	database   interfaces.Database
	fetcher    *fetcher.MenuFetcher
}

func New(c coffeteria, d interfaces.Database, f *fetcher.MenuFetcher) *Repository {
	return &Repository{
		coffeteria: c,
		database:   d,
		fetcher:    f,
	}
}

func (r *Repository) GetMenu() (*domain.Menu, error) {
	today := time.Now().Truncate(24 * time.Hour)
	if r.menu != nil && r.menu.Date().Compare(today) == 0 {
		return r.menu, nil
	}

	dishes, err := r.database.SelectRow(string(r.coffeteria))
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

	err = r.database.UpdateDishes(string(r.coffeteria), r.menu.Items)
	if err != nil {
		return nil, err
	}

	return menu, nil
}
