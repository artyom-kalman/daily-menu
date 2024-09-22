package service

import (
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/artyom-kalman/kbu-daily-menu/entities"
)

func GetPeonyMenu() (*entities.Menu, error) {
	resp, err := http.Get("https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.Reader(resp.Body))
	if err != nil {
		return nil, err
	}
	parseResponse(string(body))

	return &entities.Menu{}, nil
}

func GetAzileaMenu() *entities.Menu {
	return &entities.Menu{}
}

func parseResponse(response string) ([]*entities.MenuItem, error) {
	response = `															<li class="foodItem">순살돈가스&
</li><li class="foodItem">국물떡볶이
</li><li class="foodItem">베이컨계란말이
</li><li class="foodItem">옥수수밥
</li><li class="foodItem">미소장국
</li><li class="foodItem">콩새송이조림
</li><li class="foodItem">단무지
</li><li class="foodItem">포기김치
</li><li class="foodItem">추억의삼각포리커피우유</li>
</ul>
</td>`
	dishes := findDishs(response)
	fmt.Println(dishes)

	return []*entities.MenuItem{}, nil
}

func findDishs(dom string) []string {
	dishes := make([]string, 0)

	regex := regexp.MustCompile(`(?Ums)class="foodItem">(.*)<`)
	for _, match := range regex.FindAllStringSubmatch(dom, -1) {
		dish := strings.TrimSpace(match[1])

		if dish == "" {
			continue
		}

		dishes = append(dishes, dish)
	}

	return dishes
}
