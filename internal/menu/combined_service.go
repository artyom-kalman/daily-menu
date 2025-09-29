package menu

import (
	"fmt"
)

type CombinedMenuService struct {
	azileaRepo *Repository
	peonyRepo  *Repository
}

func NewCombinedMenuService(ar *Repository, pr *Repository) *CombinedMenuService {
	return &CombinedMenuService{
		azileaRepo: ar,
		peonyRepo:  pr,
	}
}

func (r *CombinedMenuService) GetPeonyMenu() (*Menu, error) {
	return r.peonyRepo.GetMenu()
}

func (r *CombinedMenuService) GetAzileaMenu() (*Menu, error) {
	return r.azileaRepo.GetMenu()
}

func (s *CombinedMenuService) GetMenuString() (string, error) {
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
