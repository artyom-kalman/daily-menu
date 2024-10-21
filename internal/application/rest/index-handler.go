package rest

import (
	"html/template"
	"log"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria"
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
)

func GetIndex(rw http.ResponseWriter, request *http.Request) {
	database := cafeteria.NewMenuDatabase("data/daily-menu.db")
	peonyFetcher := cafeteria.NewPeonyFetcher(cafeteria.PEONY_URL)
	azileaFetcher := cafeteria.NewAzileaFetcher(cafeteria.AZILEA_URL)

	peonyRepo := cafeteria.NewPeonyReporitory(database, peonyFetcher)
	azileaRepo := cafeteria.NewAzileaRepository(database, azileaFetcher)
	menuService := cafeteria.NewMenuService(
		azileaRepo,
		peonyRepo,
	)

	peonyMenu, err := menuService.GetPeonyMenu()
	if err != nil {
		http.Error(rw, "Error getting Peony menu", http.StatusInternalServerError)
	}

	azileaMenu, err := menuService.GetAzileaMenu()
	if err != nil {
		log.Fatal(err)
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
