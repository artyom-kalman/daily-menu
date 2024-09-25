package service

import (
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/artyom-kalman/kbu-daily-menu/internal/api/entities"
)

const PEONY_URL = "https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=4"
const AZILEA_RUL = "https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=5"

func GetPeonyMenu() (*entities.Menu, error) {
	return getMenu(PEONY_URL)
}

func GetAzileaMenu() (*entities.Menu, error) {
	return getMenu(AZILEA_RUL)
}

func getMenu(url string) (*entities.Menu, error) {
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

	menu := entities.NewMenuFromDishes(dishes)
	AddDescriptionToMenu(menu)

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

	return dishes[len(dishes)-7:]
}
