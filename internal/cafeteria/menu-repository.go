package cafeteria

import (
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
)

const PEONY_URL = "https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=4"
const AZILEA_RUL = "https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=5"

type MenuRepository struct {
	peonyMenu   *entities.Menu
	azileaMenu  *entities.Menu
	menuFetcher *MenuFetcher
}

func NewMenuRepository(menuFetcher *MenuFetcher) *MenuRepository {
	return &MenuRepository{
		peonyMenu:   nil,
		azileaMenu:  nil,
		menuFetcher: menuFetcher,
	}
}

func (r *MenuRepository) getPeonyMenu() (*entities.Menu, error) {
	if r.peonyMenu != nil {
		return r.peonyMenu, nil
	}

	fetcher := NewMenuFetcher()
	peonyMenu, err := fetcher.FetchMenu(PEONY_URL)
	if err != nil {
		return nil, err
	}

	return peonyMenu, nil
}

func (r *MenuRepository) getAzileaMenu() (*entities.Menu, error) {
	if r.peonyMenu != nil {
		return r.peonyMenu, nil
	}

	peonyMenu, err := NewMenuFetcher().FetchMenu(AZILEA_RUL)
	if err != nil {
		return nil, err
	}

	return peonyMenu, nil
}
