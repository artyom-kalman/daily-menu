package repository

import (
	"fmt"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/internal/fetcher"
	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type Cafeteria string

const (
	PEONY  Cafeteria = "peony"
	AZILEA Cafeteria = "azilea"
)

type Repository struct {
	cafeteria Cafeteria
	menu      *domain.Menu
	database  interfaces.Database
	fetcher   *fetcher.MenuFetcher
}

func New(c Cafeteria, d interfaces.Database, f *fetcher.MenuFetcher) *Repository {
	logger.Info("creating new repository for cafeteria: %s", string(c))
	return &Repository{
		cafeteria: c,
		database:  d,
		fetcher:   f,
	}
}

func (r *Repository) GetMenu() (*domain.Menu, error) {
	logger.Debug("getting menu for cafeteria: %s", string(r.cafeteria))

	today := time.Now().Truncate(24 * time.Hour)
	logger.Debug("today's date: %s", today.Format("2006-01-02"))

	if r.menu != nil && r.menu.Date().Compare(today) == 0 {
		logger.Debug("returning cached menu for %s", string(r.cafeteria))
		return r.menu, nil
	}

	logger.Debug("cached menu not available or outdated, checking database for %s", string(r.cafeteria))
	dishes, err := r.database.SelectRow(string(r.cafeteria))
	if err != nil {
		logger.Error("failed to select dishes from database for %s: %v", string(r.cafeteria), err)
		return nil, fmt.Errorf("database query failed for %s: %w", string(r.cafeteria), err)
	}

	if dishes != nil {
		logger.Info("found menu in database for %s with %d dishes", string(r.cafeteria), len(dishes))
		todaysMenu := &domain.Menu{
			Items: dishes,
			Time:  &today,
		}
		r.menu = todaysMenu
		return todaysMenu, nil
	}

	logger.Info("no menu found in database for %s, fetching from external source", string(r.cafeteria))
	menu, err := r.fetcher.FetchMenu()
	if err != nil {
		logger.Error("failed to fetch menu from external source for %s: %v", string(r.cafeteria), err)
		return nil, fmt.Errorf("menu fetch failed for %s: %w", string(r.cafeteria), err)
	}

	logger.Info("successfully fetched menu for %s with %d items", string(r.cafeteria), len(menu.Items))
	r.menu = menu

	logger.Debug("updating database with new menu for %s", string(r.cafeteria))
	err = r.database.UpdateDishes(string(r.cafeteria), r.menu.Items)
	if err != nil {
		logger.Error("failed to update database with new menu for %s: %v", string(r.cafeteria), err)
		return nil, fmt.Errorf("database update failed for %s: %w", string(r.cafeteria), err)
	}

	logger.Info("successfully updated database and cached menu for %s", string(r.cafeteria))
	return menu, nil
}
