package cafeteria

import (
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/interfaces"
)

const AZILEA = "azilea"
const AZILEA_URL = "https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=5"

type AzileaRepository struct {
	database interfaces.Database
	fetcher  interfaces.MenuFetcher
	menu     *entities.Menu
}

func NewAzileaRepository(database interfaces.Database, fetcher interfaces.MenuFetcher) *AzileaRepository {
	return &AzileaRepository{
		menu:     nil,
		database: database,
		fetcher:  fetcher,
	}
}

func (r *AzileaRepository) GetMenu() (*entities.Menu, error) {
	today := time.Now().Truncate(24 * time.Hour)
	if r.menu != nil && r.menu.Date().Compare(today) == 0 {
		return r.menu, nil
	}

	dishes, err := r.database.SelectRow(AZILEA)
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

	err = r.database.UpdateDishes(AZILEA, r.menu.Items)
	if err != nil {
		return nil, err
	}

	return menu, nil
}
