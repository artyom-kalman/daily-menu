package database

import (
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/internal/menu"
)

type MenuService struct {
	azileaRepo *Repository
	peonyRepo  *Repository
}

func NewMenuService(ar *Repository, pr *Repository) *MenuService {
	return &MenuService{
		azileaRepo: ar,
		peonyRepo:  pr,
	}
}

func (r *MenuService) GetPeonyMenu() (*menu.Menu, error) {
	return r.peonyRepo.GetMenu()
}

func (r *MenuService) GetAzileaMenu() (*menu.Menu, error) {
	return r.azileaRepo.GetMenu()
}

func (s *MenuService) GetMenuString() (string, error) {
	peony, err := s.peonyRepo.GetMenu()
	if err != nil {
		return "", err
	}

	azilea, err := s.azileaRepo.GetMenu()
	if err != nil {
		return "", nil
	}

	menu := fmt.Sprintf("Вот меню на сегодня.\nPeony (нижняя):\n%s\nAzilea (вехняя):\n%s", peony.String(), azilea.String())
	return menu, nil
}
