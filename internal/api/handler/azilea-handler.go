package handler

import (
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/api/entities"
)

func GetAzileaHandler(rw http.ResponseWriter, request *http.Request) {
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
