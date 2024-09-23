package api

import (
	"html/template"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/entities"
)

func GetIndex(rw http.ResponseWriter, request *http.Request) {
	var menu entities.Menu
	menu.Items = []*entities.MenuItem{
		{
			Name:        "Bulkogi",
			Description: "Fried meet",
		},
		{
			Name:        "Bulkogi",
			Description: "Fried meet",
		},
		{
			Name:        "Bulkogi",
			Description: "Fried meet",
		},
	}

	tmpl := template.Must(template.ParseFiles("./index.html"))
	tmpl.Execute(rw, map[string]entities.Menu{
		"Peony":  menu,
		"Azilea": menu,
	})
}
