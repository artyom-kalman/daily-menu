package api

import (
	"fmt"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/entities"
)

func GetPeonyHandler(rw http.ResponseWriter, request *http.Request) {
	var menu entities.Menu
	menu.Items = []*entities.MenuItem{
		{
			Name:        "Bulkogi",
			Description: "Fried meet",
		},
	}

	rw.Header().Set("Content-Type", "text/html")
	rw.Write([]byte(renderHtml(menu)))
}

func renderHtml(menu entities.Menu) string {
	var result string
	for _, item := range menu.Items {
		result += fmt.Sprintf("<h3>%s</h3><p>%s</p>", item.Name, item.Description)
	}

	return result
}
