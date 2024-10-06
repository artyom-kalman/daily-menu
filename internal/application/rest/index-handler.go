package rest

import (
	"html/template"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria"
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
)

func GetIndex(rw http.ResponseWriter, request *http.Request) {
	menuService := cafeteria.NewMenuService()
	peonyMenu, err := menuService.GetPeonyMenu()
	if err != nil {
		http.Error(rw, "Error getting Peony menu", http.StatusInternalServerError)
	}

	azileaMenu, err := menuService.GetAzileaMenu()
	if err != nil {
		http.Error(rw, "Error getting Azilean menu", http.StatusInternalServerError)
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
