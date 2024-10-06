package cafeteria

type MenuService struct {
	repo *MenuRepository
}

func NewMenuService() *MenuService {
	return &MenuService{
		repo: NewMenuRepository(),
	}
}

func (s *MenuService) GetPeonyMenu() (*Menu, error) {
	return s.repo.getPeonyMenu()
}

func (s *MenuService) GetAzileaMenu() (*Menu, error) {
	return s.repo.getAzileaMenu()
}
