package rest

import (
	"html/template"
	"log"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
)

func GetIndex(rw http.ResponseWriter, request *http.Request) {
	menuService, err := config.GetMenuService()
	if err != nil {
		http.Error(rw, "Error getting menu", http.StatusInternalServerError)
		log.Fatal("Error get menu service")
	}

	peonyMenu, err := menuService.GetPeonyMenu()
	if err != nil {
		http.Error(rw, "Error getting Peony menu", http.StatusInternalServerError)
		log.Fatal("Error getting Peony menu:", err)
	}

	azileaMenu, err := menuService.GetAzileaMenu()
	if err != nil {
		http.Error(rw, "Error getting Azilean menu", http.StatusInternalServerError)
		log.Fatal("Error getting Azilea menu: ", err)
	}

	tmpl, err := template.ParseFiles("templates/index.html")
	if err != nil {
		http.Error(rw, "Error loading the page", http.StatusInternalServerError)
		log.Fatal("Error loading index template")
	}

	tmpl.Execute(rw, map[string]*domain.Menu{
		"Peony":  peonyMenu,
		"Azilea": azileaMenu,
	})
}
