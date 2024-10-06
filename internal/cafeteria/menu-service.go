package cafeteria

import "github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"

type MenuService struct {
	repo *MenuRepository
}

func NewMenuService() *MenuService {
	return &MenuService{
		repo: NewMenuRepository(),
	}
}

func (s *MenuService) GetPeonyMenu() (*entities.Menu, error) {
	return s.repo.getPeonyMenu()
}

func (s *MenuService) GetAzileaMenu() (*entities.Menu, error) {
	return s.repo.getAzileaMenu()
}
