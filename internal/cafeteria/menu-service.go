package cafeteria

import (
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
)

type MenuService struct {
	repo *MenuRepository
}

func NewMenuService(menuRepo *MenuRepository) *MenuService {
	return &MenuService{
		repo: menuRepo,
	}
}

func (s *MenuService) GetPeonyMenu() (*entities.Menu, error) {
	return s.repo.getPeonyMenu()
}

func (s *MenuService) GetAzileaMenu() (*entities.Menu, error) {
	return s.repo.getAzileaMenu()
}

func (s *MenuService) GetMenuString() (string, error) {
	peony, err := s.repo.getPeonyMenu()
	if err != nil {
		return "", err
	}

	azilea, err := s.repo.getAzileaMenu()
	if err != nil {
		return "", nil
	}

	menu := fmt.Sprintf("Вот меню на сегодня.\nPeony (нижняя):\n%s\nAzilea (вехняя):\n%s", peony.String(), azilea.String())
	return menu, nil
}
