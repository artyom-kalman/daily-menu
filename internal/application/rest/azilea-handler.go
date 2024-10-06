package rest

import (
	"encoding/json"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria"
)

func GetAzileaHandler(rw http.ResponseWriter, request *http.Request) {
	menuService := cafeteria.NewMenuService()
	menu, err := menuService.GetAzileaMenu()
	if err != nil {
		http.Error(rw, "Error getting menu", http.StatusInternalServerError)
	}

	jsonMenu, err := json.Marshal(menu)
	if err != nil {
		http.Error(rw, "Error getting menu", http.StatusInternalServerError)
	}

	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(http.StatusOK)
	rw.Write(jsonMenu)
}
