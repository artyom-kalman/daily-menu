package rest

import (
	"html/template"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
	"github.com/artyom-kalman/kbu-daily-menu/internal/config"
)

func GetIndex(rw http.ResponseWriter, request *http.Request) {
	menuService, err := config.GetMenuService()
	if err != nil {
		http.Error(rw, "Error getting menu", http.StatusInternalServerError)
	}

	peonyMenu, err := menuService.GetPeonyMenu()
	if err != nil {
		http.Error(rw, "Error getting Peony menu", http.StatusInternalServerError)
		panic(err)
	}

	azileaMenu, err := menuService.GetAzileaMenu()
	if err != nil {
		http.Error(rw, "Error getting Azilean menu", http.StatusInternalServerError)
		panic(err)
	}

	tmpl, err := template.ParseFiles("templates/index.html")
	if err != nil {
		http.Error(rw, "Error loading the page", http.StatusInternalServerError)
	}

	tmpl.Execute(rw, map[string]*entities.Menu{
		"Peony":  peonyMenu,
		"Azilea": azileaMenu,
	})
}
