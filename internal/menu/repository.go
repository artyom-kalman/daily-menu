package menu

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/database"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type Repository struct {
	cafeteria   Cafeteria
	menu        *Menu
	menuRepo    *MenuRepository
	menuService *MenuService
}

func NewRepository(c Cafeteria, d *MenuRepository, s *MenuService) *Repository {
	return &Repository{
		cafeteria:   c,
		menuRepo:    d,
		menuService: s,
	}
}

func (r *Repository) GetMenu() (*Menu, error) {
	logger.Debug("getting menu for cafeteria: %s", string(r.cafeteria))

	today := time.Now().Truncate(24 * time.Hour)
	logger.Debug("today's date: %s", today.Format("2006-01-02"))

	if r.menu != nil && r.menu.Date().Compare(today) == 0 {
		logger.Debug("returning cached menu for %s", string(r.cafeteria))
		return r.menu, nil
	}

	logger.Debug("cached menu not available or outdated, checking database for %s", string(r.cafeteria))
	dishes, err := r.menuRepo.GetMenuItems(string(r.cafeteria))
	if err != nil {
		logger.Error("failed to select dishes from database for %s: %v", string(r.cafeteria), err)
		return nil, fmt.Errorf("database query failed for %s: %w", string(r.cafeteria), err)
	}

	if dishes != nil {
		logger.Info("found menu in database for %s with %d dishes", string(r.cafeteria), len(dishes))
		menuItems := make([]*MenuItem, len(dishes))
		for i, dish := range dishes {
			menuItems[i] = &MenuItem{
				Name:        dish.Name,
				Description: dish.Description,
				Spiciness:   dish.Spiciness,
			}
		}
		todaysMenu := &Menu{
			Items: menuItems,
			Time:  &today,
		}
		r.menu = todaysMenu
		return todaysMenu, nil
	}

	logger.Info("no menu found in database for %s, fetching from external source", string(r.cafeteria))
	menu, err := r.menuService.GetDailyMenu()
	if err != nil {
		logger.Error("failed to fetch menu from external source for %s: %v", string(r.cafeteria), err)
		return nil, fmt.Errorf("menu fetch failed for %s: %w", string(r.cafeteria), err)
	}

	logger.Info("successfully fetched menu for %s with %d items", string(r.cafeteria), len(menu.Items))
	r.menu = menu

	logger.Debug("updating database with new menu for %s", string(r.cafeteria))
	dbItems := make([]*MenuItem, len(r.menu.Items))
	for i, item := range r.menu.Items {
		dbItems[i] = &MenuItem{
			Name:        item.Name,
			Description: item.Description,
			Spiciness:   item.Spiciness,
		}
	}
	err = r.menuRepo.SaveMenuItems(string(r.cafeteria), dbItems)
	if err != nil {
		logger.Error("failed to update database with new menu for %s: %v", string(r.cafeteria), err)
		return nil, fmt.Errorf("database update failed for %s: %w", string(r.cafeteria), err)
	}

	logger.Info("successfully updated database and cached menu for %s", string(r.cafeteria))
	return menu, nil
}

type MenuRepository struct {
	db *database.Database
}

func NewMenuRepository(d *database.Database) *MenuRepository {
	return &MenuRepository{
		db: d,
	}
}

func (r *MenuRepository) GetMenuItems(cafeteria string) ([]*MenuItem, error) {
	return r.SelectRow(cafeteria)
}

func (r *MenuRepository) SaveMenuItems(cafeteria string, items []*MenuItem) error {
	return r.UpdateDishes(cafeteria, items)
}

func (r *MenuRepository) UpdateDishes(cafeteria string, dishes []*MenuItem) error {
	err := r.db.Connect()
	if err != nil {
		return err
	}
	defer r.db.Close()

	dishesJson, err := json.Marshal(dishes)
	if err != nil {
		return err
	}

	updateQuery := "UPDATE menu SET dishes = $1, date = DATE('now') WHERE cafeteria = $2;"
	_, err = r.db.Conn.Exec(updateQuery, string(dishesJson), cafeteria)
	if err != nil {
		return err
	}

	return nil
}

func (r *MenuRepository) SelectRow(cafeteria string) ([]*MenuItem, error) {
	err := r.db.Connect()
	if err != nil {
		return nil, err
	}
	defer r.db.Close()

	selectQuery := fmt.Sprintf("SELECT dishes FROM menu WHERE cafeteria = '%s' AND date = DATE('now');", cafeteria)
	rows, err := r.db.Conn.Query(selectQuery)
	if err != nil {
		return nil, err
	}

	if !rows.Next() {
		return nil, nil
	}

	var dishesJson string
	err = rows.Scan(&dishesJson)
	if err != nil {
		return nil, err
	}

	var dishes []*MenuItem
	err = json.Unmarshal([]byte(dishesJson), &dishes)
	if err != nil {
		return nil, err
	}

	return dishes, nil
}
