package cafeteria

import (
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/interfaces"
)

const PEONY = "peony"
const PEONY_URL = "https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=4"

type PeonyRepository struct {
	menu     *entities.Menu
	database interfaces.Database
	fetcher  interfaces.MenuFetcher
}

func NewPeonyReporitory(database interfaces.Database, fetcher interfaces.MenuFetcher) *PeonyRepository {
	return &PeonyRepository{
		menu:     nil,
		database: database,
		fetcher:  fetcher,
	}
}

func (r *PeonyRepository) GetMenu() (*entities.Menu, error) {
	today := time.Now().Truncate(24 * time.Hour)
	if r.menu != nil && r.menu.Date().Compare(today) == 0 {
		return r.menu, nil
	}

	dishes, err := r.database.SelectRow(PEONY)
	if err != nil {
		return nil, err
	}

	if dishes != nil {
		todaysMenu := &entities.Menu{
			Items: dishes,
			Time:  &today,
		}
		r.menu = todaysMenu
		return todaysMenu, nil
	}

	menu, err := r.fetcher.FetchMenu()
	if err != nil {
		return nil, err
	}
	r.menu = menu

	err = r.database.UpdateDishes(PEONY, r.menu.Items)
	if err != nil {
		return nil, err
	}

	return menu, nil
}
