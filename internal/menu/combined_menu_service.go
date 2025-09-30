package menu

import (
	"fmt"
)

type CombinedMenuService struct {
	peonyOrchestration  *MenuOrchestrationService
	azileaOrchestration *MenuOrchestrationService
}

func NewCombinedMenuService(peonyOrchestration, azileaOrchestration *MenuOrchestrationService) *CombinedMenuService {
	return &CombinedMenuService{
		peonyOrchestration:  peonyOrchestration,
		azileaOrchestration: azileaOrchestration,
	}
}

func (s *CombinedMenuService) GetPeonyMenu() (*Menu, error) {
	return s.peonyOrchestration.GetMenu(PEONY)
}

func (s *CombinedMenuService) GetAzileaMenu() (*Menu, error) {
	return s.azileaOrchestration.GetMenu(AZILEA)
}

func (s *CombinedMenuService) GetMenuString() (string, error) {
	peony, err := s.peonyOrchestration.GetMenu(PEONY)
	if err != nil {
		return "", err
	}

	azilea, err := s.azileaOrchestration.GetMenu(AZILEA)
	if err != nil {
		return "", nil
	}

	menu := fmt.Sprintf("Вот меню на сегодня.\nPeony (нижняя):\n%s\nAzilea (вехняя):\n%s", peony.String(), azilea.String())
	return menu, nil
}
