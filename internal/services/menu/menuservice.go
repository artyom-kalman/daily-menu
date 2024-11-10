package menu

import (
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces"
)

type MenuService struct {
	azileaRepo interfaces.MenuRepository
	peonyRepo  interfaces.MenuRepository
}

func NewMenuService(azileaRepo interfaces.MenuRepository, peonyRepo interfaces.MenuRepository) *MenuService {
	return &MenuService{
		azileaRepo: azileaRepo,
		peonyRepo:  peonyRepo,
	}
}

func (r *MenuService) GetPeonyMenu() (*domain.Menu, error) {
	return r.peonyRepo.GetMenu()
}

func (r *MenuService) GetAzileaMenu() (*domain.Menu, error) {
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
