package cafeteria

import (
	"io"
	"net/http"
	"regexp"
	"strings"
)

const PEONY_URL = "https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=4"
const AZILEA_RUL = "https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=5"

type MenuRepository struct {
	peonyMenu  *Menu
	azileaMenu *Menu
}

func NewMenuRepository() *MenuRepository {
	return &MenuRepository{
		peonyMenu:  nil,
		azileaMenu: nil,
	}
}

func (r *MenuRepository) getPeonyMenu() (*Menu, error) {
	if r.peonyMenu != nil {
		return r.peonyMenu, nil
	}

	peonyMenu, err := r.getMenu(PEONY_URL)
	if err != nil {
		return nil, err
	}

	return peonyMenu, nil
}

func (r *MenuRepository) getAzileaMenu() (*Menu, error) {
	if r.peonyMenu != nil {
		return r.peonyMenu, nil
	}

	peonyMenu, err := r.getMenu(AZILEA_RUL)
	if err != nil {
		return nil, err
	}

	return peonyMenu, nil
}

func (r *MenuRepository) getMenu(url string) (*Menu, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.Reader(resp.Body))
	if err != nil {
		return nil, err
	}

	dishes, err := parseResponse(string(body))
	if err != nil {
		return nil, err
	}

	menu := NewMenuFromDishes(dishes)
	if len(menu.Items) < 1 {
		menu.Items = append(menu.Items, &MenuItem{
			Name: "Сегодня тут пусто",
		})
		return menu, nil
	}

	err = AddDescriptionToMenu(menu)
	if err != nil {
		return nil, err
	}

	return menu, nil
}

func parseResponse(response string) ([]string, error) {
	dishes := findTodaysDishes(response)

	return dishes, nil
}

func findTodaysDishes(dom string) []string {
	dishes := make([]string, 0)

	regex := regexp.MustCompile(`(?Ums)class="foodItem">(.*)<`)
	for _, match := range regex.FindAllStringSubmatch(dom, -1) {
		dish := strings.TrimSpace(match[1])

		if dish == "" {
			continue
		}

		dishes = append(dishes, dish)
	}

	if len(dishes) > 7 {
		return dishes[len(dishes)-7:]
	} else {
		return dishes
	}
}
