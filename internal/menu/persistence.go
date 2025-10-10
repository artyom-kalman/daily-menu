package menu

import (
	"fmt"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type MenuPersistenceService struct {
	repo *MenuRepository
}

func NewMenuPersistenceService(repo *MenuRepository) *MenuPersistenceService {
	return &MenuPersistenceService{
		repo: repo,
	}
}

func (p *MenuPersistenceService) LoadMenu(cafeteria Cafeteria) (*Menu, error) {
	dishes, err := p.repo.GetMenuItems(string(cafeteria))
	if err != nil {
		logger.Error("failed to load menu from database for %s: %v", string(cafeteria), err)
		return nil, fmt.Errorf("database query failed for %s: %w", string(cafeteria), err)
	}

	if dishes == nil {
		return nil, nil
	}

	today := time.Now().Truncate(24 * time.Hour)
	menuItems := make([]*MenuItem, len(dishes))
	for i, dish := range dishes {
		menuItems[i] = &MenuItem{
			Name:        dish.Name,
			Description: dish.Description,
			Spiciness:   dish.Spiciness,
		}
	}

	return &Menu{
		Items: menuItems,
		Time:  &today,
	}, nil
}

func (p *MenuPersistenceService) SaveMenu(cafeteria Cafeteria, menu *Menu) error {
	err := p.repo.SaveMenuItems(string(cafeteria), menu.Items)
	if err != nil {
		logger.Error("failed to save menu to database for %s: %v", string(cafeteria), err)
		return fmt.Errorf("database update failed for %s: %w", string(cafeteria), err)
	}

	return nil
}
