package rest

import (
	"html/template"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria"
	"github.com/artyom-kalman/kbu-daily-menu/internal/chatgpt"
)

func GetIndex(rw http.ResponseWriter, request *http.Request) {
	peonyMenu, err := cafeteria.GetPeonyMenu()
	if err != nil {
		http.Error(rw, "Error getting Peony menu", http.StatusInternalServerError)
	}
	chatgpt.AddDescriptionToMenu(peonyMenu)

	azileaMenu, err := cafeteria.GetAzileaMenu()
	if err != nil {
		http.Error(rw, "Error getting Azilean menu", http.StatusInternalServerError)
	}
	chatgpt.AddDescriptionToMenu(azileaMenu)

	tmpl, err := template.ParseFiles("templates/index.html")
	if err != nil {
		http.Error(rw, "Error loading the page", http.StatusInternalServerError)
	}

	tmpl.Execute(rw, map[string]*cafeteria.Menu{
		"Peony":  peonyMenu,
		"Azilea": azileaMenu,
	})
}
