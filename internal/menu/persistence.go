package menu

import (
	"fmt"
	"log/slog"
	"time"
)

type MenuPersistenceService struct {
	repo *MenuRepository
}

func NewMenuPersistenceService(repo *MenuRepository) *MenuPersistenceService {
	return &MenuPersistenceService{
		repo: repo,
	}
}

func getKoreanTime() time.Time {
	kst, _ := time.LoadLocation("Asia/Seoul")
	return time.Now().In(kst)
}

func (p *MenuPersistenceService) LoadMenu(cafeteria Cafeteria) (*Menu, error) {
	koreanToday := getKoreanTime().Truncate(24 * time.Hour)
	dishes, err := p.repo.GetMenu(string(cafeteria), koreanToday)
	if err != nil {
		slog.Error("Failed to load menu from database",
			"error", err,
			"cafeteria", string(cafeteria))
		return nil, fmt.Errorf("database query failed for %s: %w", string(cafeteria), err)
	}

	if dishes == nil {
		return nil, nil
	}

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
		Time:  &koreanToday,
	}, nil
}

func (p *MenuPersistenceService) SaveMenu(cafeteria Cafeteria, menu *Menu) error {
	koreanToday := getKoreanTime().Truncate(24 * time.Hour)
	err := p.repo.SaveMenu(string(cafeteria), menu.Items, koreanToday)
	if err != nil {
		slog.Error("Failed to save menu to database",
			"error", err,
			"cafeteria", string(cafeteria))
		return fmt.Errorf("database update failed for %s: %w", string(cafeteria), err)
	}

	return nil
}
