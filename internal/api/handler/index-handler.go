package handler

import (
	"html/template"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/api/entities"
	"github.com/artyom-kalman/kbu-daily-menu/internal/api/service"
)

func GetIndex(rw http.ResponseWriter, request *http.Request) {
	peonyMenu, err := service.GetPeonyMenu()
	if err != nil {
		http.Error(rw, "Error getting Peony menu", http.StatusInternalServerError)
	}

	azileaMenu, err := service.GetAzileaMenu()
	if err != nil {
		http.Error(rw, "Error getting Peony menu", http.StatusInternalServerError)
	}

	tmpl := template.Must(template.ParseFiles("templates/index.html"))
	tmpl.Execute(rw, map[string]*entities.Menu{
		"Peony":  peonyMenu,
		"Azilea": azileaMenu,
	})
}
